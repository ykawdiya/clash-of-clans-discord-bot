const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cacheService = require('./cacheService');
const { api: log } = require('../utils/logger');

class RateLimiter {
    constructor(maxRequests = 20, timeWindowMs = 1000) {
        this.maxRequests = maxRequests;
        this.timeWindowMs = timeWindowMs;
        this.requestTimestamps = [];
    }

    async throttle() {
        // Remove timestamps outside the current window
        const now = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.timeWindowMs
        );

        // If we've hit the limit, wait until the oldest request falls out of the window
        if (this.requestTimestamps.length >= this.maxRequests) {
            const oldestTimestamp = this.requestTimestamps[0];
            const waitTime = this.timeWindowMs - (now - oldestTimestamp);

            if (waitTime > 0) {
                log.info(`Rate limit reached, waiting ${waitTime}ms before next request`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Add current request timestamp
        this.requestTimestamps.push(Date.now());
    }
}

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.defaultTimeout = 5000;
        this.proxyConfigured = false;
        this.apiStatus = {
            lastSuccessTime: null,
            lastErrorTime: null,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitHits: 0
        };

        // Create rate limiter - CoC API typically allows 10-20 requests/sec
        this.rateLimiter = new RateLimiter(10, 1000);

        // Check proxy configuration on startup
        log.info('Initializing Clash of Clans API service');
        this.checkProxyConfig();

        // Set up exponential backoff for retries
        this.maxRetries = 3;

        // API key rotation
        this.apiKeys = [];
        this.currentKeyIndex = 0;
        this.lastKeyRotation = Date.now();
        this.keyRotationInterval = (process.env.API_KEY_ROTATION_DAYS || 30) * 24 * 60 * 60 * 1000;

        // Load API keys
        this.loadApiKeys();

        // Setup key rotation interval
        setInterval(() => this.rotateApiKey(), 3600000); // Check hourly
    }

    loadApiKeys() {
        // Get API key(s) from environment
        const apiKey = process.env.COC_API_KEY;

        // In a testing environment, use a mock key if not provided
        if (!apiKey) {
            // Check if we're in a test environment
            if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
                this.apiKeys = ['test-mock-key'];
                console.log('Using mock API key for testing environment');
                return;
            }

            // In production, an API key is required
            throw new Error('Clash of Clans API key is not configured');
        }

        // Handle multiple keys if provided (comma-separated)
        this.apiKeys = apiKey.split(',').map(key => key.trim());

        if (this.apiKeys.length === 0) {
            throw new Error('No valid API keys found');
        }

        log.info(`Loaded ${this.apiKeys.length} API key(s)`);
    }

    rotateApiKey() {
        // Skip rotation if only one key or not enough time has passed
        if (this.apiKeys.length <= 1 || (Date.now() - this.lastKeyRotation) < this.keyRotationInterval) {
            return;
        }

        // Move to next key
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        this.lastKeyRotation = Date.now();

        log.info(`Rotated to API key ${this.currentKeyIndex + 1} of ${this.apiKeys.length}`);
    }

    getCurrentApiKey() {
        return this.apiKeys[this.currentKeyIndex];
    }

    checkProxyConfig() {
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            this.proxyConfigured = true;
            log.info('Proxy configuration is complete');
        } else {
            this.proxyConfigured = false;
            log.warn('Proxy configuration incomplete - using direct connection');
        }
    }

    getClient() {
        const apiKey = this.getCurrentApiKey();
        if (!apiKey) {
            throw new Error('Clash of Clans API key is not configured');
        }

        // Create client with optimized settings
        const client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.defaultTimeout,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey.trim()}`
            }
        });

        // Set up proxy if configured
        if (this.proxyConfigured) {
            try {
                const proxyHost = process.env.PROXY_HOST;
                const proxyPort = process.env.PROXY_PORT;
                const proxyUser = process.env.PROXY_USERNAME;
                const proxyPass = process.env.PROXY_PASSWORD;

                const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
                const httpsAgent = new HttpsProxyAgent(proxyUrl);

                client.defaults.httpsAgent = httpsAgent;
                client.defaults.proxy = false;
            } catch (error) {
                log.error('Error setting up proxy', { error: error.message });
                this.proxyConfigured = false;
            }
        }

        // Add response interceptor for rate limit handling
        client.interceptors.response.use(null, async (error) => {
            // Don't retry if we've hit max retries
            const config = error.config || {};
            config.retryCount = config.retryCount || 0;

            // Check if we should retry
            const shouldRetry =
                config.retryCount < this.maxRetries &&
                (!error.response || error.response.status === 429 || error.response.status >= 500);

            if (shouldRetry) {
                config.retryCount += 1;

                // If rate limited, wait longer
                if (error.response && error.response.status === 429) {
                    // Track rate limit hit
                    this.apiStatus.rateLimitHits++;

                    // Get retry-after header or use exponential backoff
                    const retryAfter = error.response.headers['retry-after'];
                    const waitTime = retryAfter ?
                        parseInt(retryAfter) * 1000 :
                        Math.pow(2, config.retryCount) * 1000;

                    log.warn(`Rate limited by API, waiting ${waitTime}ms before retry`, {
                        endpoint: config.url,
                        attempt: config.retryCount,
                        waitTime
                    });

                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    // Normal retry with exponential backoff
                    const waitTime = Math.pow(2, config.retryCount) * 1000;
                    log.info(`Retrying failed request in ${waitTime}ms`, {
                        endpoint: config.url,
                        attempt: config.retryCount,
                        status: error.response?.status
                    });

                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                // Retry the request
                return client.request(config);
            }

            // If we shouldn't retry, throw the error
            return Promise.reject(error);
        });

        return client;
    }

    formatTag(tag) {
        if (!tag) throw new Error('Tag is required');

        // Format tag properly
        tag = tag.trim();
        if (!tag.startsWith('#')) tag = '#' + tag;
        return encodeURIComponent(tag.toUpperCase());
    }

    async executeRequest(endpoint, options = {}) {
        // Apply rate limiting
        await this.rateLimiter.throttle();

        this.apiStatus.totalRequests++;
        const requestTimeout = options.timeout || this.defaultTimeout;

        const startTime = Date.now();

        try {
            const client = this.getClient();
            const response = await client.request({
                url: endpoint,
                method: options.method || 'get',
                params: options.params,
                data: options.data,
                timeout: requestTimeout
            });

            // Success case
            this.apiStatus.lastSuccessTime = new Date();
            this.apiStatus.successfulRequests++;

            const endTime = Date.now();
            const duration = endTime - startTime;

            log.debug(`API request succeeded in ${duration}ms`, {
                endpoint,
                duration,
                status: response.status
            });

            return response.data;

        } catch (error) {
            // Request failed
            this.apiStatus.lastErrorTime = new Date();
            this.apiStatus.failedRequests++;

            const endTime = Date.now();
            const duration = endTime - startTime;

            log.error(`API request failed after ${duration}ms`, {
                endpoint,
                status: error.response?.status,
                error: error.message
            });

            // Create user-friendly error messages
            if (error.response) {
                const status = error.response.status;
                if (status === 403) {
                    throw new Error(`Access denied (403). IP address may not be whitelisted.`);
                } else if (status === 404) {
                    throw new Error(`Not found (404): The requested resource does not exist.`);
                } else if (status === 429) {
                    throw new Error(`Rate limited (429): Too many requests to the API.`);
                } else {
                    throw new Error(`API error: HTTP ${status}`);
                }
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error(`Request timed out. The API may be experiencing issues.`);
            } else {
                throw new Error(`Network error: ${error.message}`);
            }
        }
    }

    // API methods with improved caching
    async getClan(clanTag) {
        try {
            const cacheKey = `clan:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) {
                log.debug(`Cache hit for clan ${clanTag}`);
                return cachedData;
            }

            log.info(`Fetching clan data for ${clanTag}`);
            const formattedTag = this.formatTag(clanTag);
            const data = await this.executeRequest(`/clans/${formattedTag}`);

            // Cache for 10 minutes
            cacheService.set(cacheKey, data, 600);
            return data;
        } catch (error) {
            log.error(`Error getting clan data for ${clanTag}`, { error: error.message });
            throw error;
        }
    }

    async getPlayer(playerTag) {
        try {
            const cacheKey = `player:${playerTag}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) {
                log.debug(`Cache hit for player ${playerTag}`);
                return cachedData;
            }

            log.info(`Fetching player data for ${playerTag}`);
            const formattedTag = this.formatTag(playerTag);
            const data = await this.executeRequest(`/players/${formattedTag}`);

            // Cache for 10 minutes
            cacheService.set(cacheKey, data, 600);
            return data;
        } catch (error) {
            log.error(`Error getting player data for ${playerTag}`, { error: error.message });
            throw error;
        }
    }

    async getCurrentWar(clanTag) {
        try {
            const cacheKey = `currentWar:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) {
                log.debug(`Cache hit for current war of clan ${clanTag}`);
                return cachedData;
            }

            log.info(`Fetching current war for ${clanTag}`);
            const formattedTag = this.formatTag(clanTag);
            const data = await this.executeRequest(`/clans/${formattedTag}/currentwar`);

            // Cache for 5 minutes
            cacheService.set(cacheKey, data, 300);
            return data;
        } catch (error) {
            // Special handling for "not in war" error
            if (error.message.includes('403') || error.message.includes('404')) {
                return { state: 'notInWar' };
            }
            log.error(`Error getting current war for ${clanTag}`, { error: error.message });
            throw error;
        }
    }

    async searchClans(params = {}) {
        try {
            const cacheKey = `clanSearch:${JSON.stringify(params)}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) {
                log.debug(`Cache hit for clan search with params ${JSON.stringify(params)}`);
                return cachedData;
            }

            log.info(`Searching clans with params ${JSON.stringify(params)}`);
            const data = await this.executeRequest('/clans', { params });

            // Cache for 10 minutes
            cacheService.set(cacheKey, data, 600);
            return data;
        } catch (error) {
            log.error(`Error searching clans`, { error: error.message, params });
            throw error;
        }
    }

    // Test the API connection
    async testProxyConnection() {
        try {
            await this.executeRequest('/locations', { timeout: 3000 });
            return { success: true };
        } catch (error) {
            log.error('API connection test failed', { error: error.message });
            return {
                success: false,
                message: error.message
            };
        }
    }

    // Get service status
    getStatus() {
        return {
            apiKey: !!this.getCurrentApiKey(),
            keyCount: this.apiKeys.length,
            proxyConfigured: this.proxyConfigured,
            lastSuccessTime: this.apiStatus.lastSuccessTime,
            lastErrorTime: this.apiStatus.lastErrorTime,
            totalRequests: this.apiStatus.totalRequests,
            successfulRequests: this.apiStatus.successfulRequests,
            failedRequests: this.apiStatus.failedRequests,
            rateLimitHits: this.apiStatus.rateLimitHits,
            successRate: this.apiStatus.totalRequests > 0
                ? (this.apiStatus.successfulRequests / this.apiStatus.totalRequests * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

module.exports = new ClashApiService();