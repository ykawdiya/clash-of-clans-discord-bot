const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cacheService = require('./cacheService');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 1; // Reduced from 2 for better responsiveness
        this.proxyConfigured = false;
        this.currentProxyIP = null;
        this.lastError = null;
        this.apiStatus = {
            lastSuccessTime: null,
            lastErrorTime: null,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0
        };

        // Default timeout values
        this.defaultTimeout = 3000;
        this.verifyProxyTimeout = 3000;

        // Check proxy configuration on startup
        console.log('Initializing Clash of Clans API service');
        this.checkProxyConfig();
    }

    checkProxyConfig() {
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            this.proxyConfigured = true;
            console.log('Proxy configuration is complete');

            // Test proxy connection but don't wait for it
            this.verifyProxyIP().catch(err => {
                console.error('Error verifying proxy IP:', err.message);
            });
        } else {
            this.proxyConfigured = false;
            console.warn('Proxy configuration incomplete - using direct connection');
        }
    }

    async verifyProxyIP() {
        try {
            const client = this.getProxyOnlyClient();
            const response = await Promise.race([
                client.get('https://api.ipify.org?format=json'),
                new Promise((_, reject) => setTimeout(() =>
                    reject(new Error('Proxy verification timed out')), this.verifyProxyTimeout))
            ]);

            this.currentProxyIP = response.data.ip;
            console.log(`Current proxy IP: ${this.currentProxyIP}`);
            return this.currentProxyIP;
        } catch (error) {
            console.error('Failed to verify proxy IP:', error.message);
            this.lastError = error;
            throw error;
        }
    }

    getProxyOnlyClient() {
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        if (!(proxyHost && proxyPort && proxyUser && proxyPass)) {
            throw new Error('Proxy not fully configured');
        }

        try {
            const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
            const httpsAgent = new HttpsProxyAgent(proxyUrl);
            return axios.create({ httpsAgent, proxy: false, timeout: this.verifyProxyTimeout });
        } catch (error) {
            console.error('Error creating proxy client:', error.message);
            throw error;
        }
    }

    getClient() {
        const apiKey = process.env.COC_API_KEY;
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
                console.error('Error setting up proxy:', error.message);
                this.proxyConfigured = false;
            }
        }

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
        this.apiStatus.totalRequests++;

        // Use a single attempt first for speed, only retry if needed
        const requestTimeout = options.timeout || this.defaultTimeout;

        try {
            const client = this.getClient();
            const response = await Promise.race([
                client.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                }),
                new Promise((_, reject) => setTimeout(() =>
                    reject(new Error(`Request timed out after ${requestTimeout}ms`)), requestTimeout))
            ]);

            // Success case
            this.apiStatus.lastSuccessTime = new Date();
            this.apiStatus.successfulRequests++;
            return response.data;

        } catch (error) {
            // Retry only on specific errors that might be temporary
            const shouldRetry =
                !error.response ||
                error.response.status === 503 ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                error.message.includes('timeout');

            if (shouldRetry) {
                try {
                    // Short delay before retry
                    await new Promise(resolve => setTimeout(resolve, 300));

                    const client = this.getClient();
                    const response = await Promise.race([
                        client.request({
                            url: endpoint,
                            method: options.method || 'get',
                            params: options.params,
                            data: options.data
                        }),
                        new Promise((_, reject) => setTimeout(() =>
                            reject(new Error(`Retry timed out after ${requestTimeout}ms`)), requestTimeout))
                    ]);

                    this.apiStatus.lastSuccessTime = new Date();
                    this.apiStatus.successfulRequests++;
                    return response.data;
                } catch (retryError) {
                    // Use the retry error as the main error
                    error = retryError;
                }
            }

            // Request failed entirely
            this.apiStatus.failedRequests++;
            this.lastError = error;

            // Create user-friendly error messages
            if (error.response) {
                const status = error.response.status;
                if (status === 403) {
                    throw new Error(`Access denied (403). IP address may not be whitelisted.`);
                } else if (status === 404) {
                    throw new Error(`Not found (404): The requested resource does not exist.`);
                } else {
                    throw new Error(`API error: HTTP ${status}`);
                }
            } else if (error.message.includes('timeout')) {
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
            if (cachedData) return cachedData;

            const formattedTag = this.formatTag(clanTag);
            const data = await this.executeRequest(`/clans/${formattedTag}`);

            // Cache for 10 minutes instead of 5 to reduce API calls
            cacheService.set(cacheKey, data, 600);
            return data;
        } catch (error) {
            console.error(`Error getting clan data:`, error.message);
            throw error;
        }
    }

    async getPlayer(playerTag) {
        try {
            const cacheKey = `player:${playerTag}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) return cachedData;

            const formattedTag = this.formatTag(playerTag);
            const data = await this.executeRequest(`/players/${formattedTag}`);

            // Cache for 10 minutes
            cacheService.set(cacheKey, data, 600);
            return data;
        } catch (error) {
            console.error(`Error getting player data:`, error.message);
            throw error;
        }
    }

    async getCurrentWar(clanTag) {
        try {
            const cacheKey = `currentWar:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);
            if (cachedData) return cachedData;

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
            throw error;
        }
    }

    // Helper methods and other API endpoints remain the same
    getStatus() {
        return {
            apiKey: !!process.env.COC_API_KEY,
            proxyConfigured: this.proxyConfigured,
            proxyIP: this.currentProxyIP,
            lastSuccessTime: this.apiStatus.lastSuccessTime,
            lastErrorTime: this.apiStatus.lastErrorTime,
            totalRequests: this.apiStatus.totalRequests,
            successRate: this.apiStatus.totalRequests > 0
                ? (this.apiStatus.successfulRequests / this.apiStatus.totalRequests * 100).toFixed(1) + '%'
                : 'N/A',
            lastError: this.lastError ? this.lastError.message : null
        };
    }
}

module.exports = new ClashApiService();