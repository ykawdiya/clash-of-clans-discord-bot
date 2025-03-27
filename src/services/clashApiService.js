// src/services/clashApiService.js
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cacheService = require('./cacheService'); // Add cache service import

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 2;
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
        this.defaultTimeout = 3000; // Increased from 2000 to 3000ms for better reliability
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

        console.log('Proxy configuration:', {
            host: proxyHost ? 'SET' : 'NOT SET',
            port: proxyPort ? 'SET' : 'NOT SET',
            username: proxyUser ? 'SET' : 'NOT SET',
            password: proxyPass ? 'SET' : 'NOT SET'
        });

        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            this.proxyConfigured = true;
            console.log('Proxy configuration is complete');

            // Test proxy connection immediately but don't wait for it
            this.verifyProxyIP().catch(err => {
                console.error('Error verifying proxy IP at startup:', err.message);
                this.lastError = err;
            });
        } else {
            this.proxyConfigured = false;
            console.warn('Proxy configuration is incomplete - all requests will use direct connection');
        }
    }

    async verifyProxyIP() {
        try {
            console.log('Verifying proxy IP address...');
            const client = this.getProxyOnlyClient();

            // Set a shorter timeout for verification
            const response = await Promise.race([
                client.get('https://api.ipify.org?format=json'),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Proxy verification timed out')), this.verifyProxyTimeout)
                )
            ]);

            this.currentProxyIP = response.data.ip;

            console.log(`Current proxy IP: ${this.currentProxyIP}`);
            console.log(`If you're getting 403 errors, ensure this IP is whitelisted: ${this.currentProxyIP}`);

            return this.currentProxyIP;
        } catch (error) {
            console.error('Failed to verify proxy IP:', error.message);
            this.lastError = error;
            throw error;
        }
    }

    // This client is just for IP verification
    getProxyOnlyClient() {
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        // Only create if proxy is configured
        if (!(proxyHost && proxyPort && proxyUser && proxyPass)) {
            throw new Error('Proxy not fully configured');
        }

        try {
            // Create proxy URL and agent
            const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
            const httpsAgent = new HttpsProxyAgent(proxyUrl);

            return axios.create({
                httpsAgent,
                proxy: false,
                timeout: this.verifyProxyTimeout
            });
        } catch (error) {
            console.error('Error creating proxy client:', error.message);
            this.lastError = error;
            throw error;
        }
    }

    getClient() {
        const apiKey = process.env.COC_API_KEY;

        if (!apiKey) {
            const error = new Error('Clash of Clans API key is not configured');
            this.lastError = error;
            throw error;
        }

        // Clean the API key to remove any whitespace
        const cleanApiKey = apiKey.trim();

        // Create the client first with reduced timeout
        const client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.defaultTimeout
        });

        // Set the base headers
        client.defaults.headers.common['Accept'] = 'application/json';
        client.defaults.headers.common['Authorization'] = `Bearer ${cleanApiKey}`;

        // Set up proxy
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        // Only add proxy if all values are provided
        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            try {
                // Create proxy URL (more compatible format)
                const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;

                // Create proxy agent
                const httpsAgent = new HttpsProxyAgent(proxyUrl);

                // Configure client with proxy
                client.defaults.httpsAgent = httpsAgent;
                client.defaults.proxy = false; // This tells axios to use the httpsAgent
                this.proxyConfigured = true;
            } catch (error) {
                console.error('Error setting up proxy:', error.message);
                this.proxyConfigured = false;
                this.lastError = error;
            }
        }

        return client;
    }

    formatTag(tag) {
        if (!tag) {
            const error = new Error('Tag is required');
            this.lastError = error;
            throw error;
        }

        // Remove whitespace
        tag = tag.trim();

        // Add # if missing
        if (!tag.startsWith('#')) {
            tag = '#' + tag;
        }

        // Convert to uppercase
        tag = tag.toUpperCase();

        // URL encode
        return encodeURIComponent(tag);
    }

    async executeRequest(endpoint, options = {}) {
        console.log(`Executing request to ${endpoint}`);
        this.apiStatus.totalRequests++;

        // Only check proxy IP if needed and not already verified
        if (this.proxyConfigured && !this.currentProxyIP) {
            try {
                await Promise.race([
                    this.verifyProxyIP(),
                    new Promise((_, reject) =>
                        setTimeout(() => {
                            console.log('Proxy verification taking too long, continuing with request');
                            reject(new Error('Proxy verification timeout'));
                        }, 1000) // Very short timeout for verification during request
                    )
                ]);
            } catch (err) {
                // Just log but continue with the request
                console.warn('Could not verify proxy IP before request, continuing anyway');
            }
        }

        // Try up to retryCount times
        let lastError = null;

        for (let attempt = 0; attempt < this.retryCount; attempt++) {
            try {
                console.log(`Attempt ${attempt + 1}/${this.retryCount}`);

                const client = this.getClient();

                // Add a specific timeout for this request (potentially shorter than the client default)
                const requestTimeout = options.timeout || this.defaultTimeout;

                // Execute request with timeout
                const responsePromise = client.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });

                // Race the request against a timeout
                const response = await Promise.race([
                    responsePromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Request timed out after ${requestTimeout}ms`)),
                            requestTimeout)
                    )
                ]);

                console.log(`Request successful: Status ${response.status}`);

                // Update success stats
                this.apiStatus.lastSuccessTime = new Date();
                this.apiStatus.successfulRequests++;

                return response.data;

            } catch (error) {
                console.error(`Request attempt ${attempt + 1} failed:`, error.message);
                this.lastError = error;
                this.apiStatus.lastErrorTime = new Date();

                // Only log detailed error info if it's available
                if (error.response) {
                    console.error('Response status:', error.response.status);

                    // Check specifically for IP whitelist issues
                    if (error.response.status === 403 &&
                        error.response.data &&
                        error.response.data.message &&
                        error.response.data.message.includes('IP')) {

                        console.error('IP WHITELIST ERROR DETECTED!');
                        console.error(`Make sure IP ${this.currentProxyIP || 'Unknown'} is whitelisted at developer.clashofclans.com`);
                    }
                }

                lastError = error;

                // Only retry on connection/timeout errors or 503 errors (service unavailable)
                const shouldRetry =
                    !error.response ||
                    error.response.status === 503 ||
                    error.code === 'ECONNABORTED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNRESET' ||
                    error.message.includes('timeout');

                if (!shouldRetry) {
                    console.log('Error is not retryable, breaking retry loop');
                    break;
                }

                // Shorter wait before retrying - fixed at 500ms to avoid Discord timeout
                if (attempt < this.retryCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        // All attempts failed - enhance error handling
        this.apiStatus.failedRequests++;

        // Create a more descriptive error based on what happened
        if (lastError.response) {
            const status = lastError.response.status;
            const message = lastError.response.data?.message || lastError.message;

            if (status === 403) {
                throw new Error(`Access denied (403). The IP address (${this.currentProxyIP || 'Unknown'}) may not be whitelisted.`);
            } else if (status === 404) {
                throw new Error(`Not found (404): The requested resource at ${endpoint} does not exist.`);
            } else {
                throw new Error(`API error: HTTP ${status} - ${message}`);
            }
        } else if (lastError.message.includes('timeout')) {
            throw new Error(`Request timed out after ${this.retryCount} attempts. The Clash of Clans API may be experiencing issues.`);
        } else {
            throw new Error(`Network error after ${this.retryCount} attempts: ${lastError.message}`);
        }
    }

    // Modified API methods with caching
    async getClan(clanTag) {
        try {
            const cacheKey = `clan:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);

            if (cachedData) {
                console.log(`Using cached data for clan ${clanTag}`);
                return cachedData;
            }

            const formattedTag = this.formatTag(clanTag);
            console.log(`Getting clan data for: ${formattedTag}`);
            const data = await this.executeRequest(`/clans/${formattedTag}`, { timeout: 3000 });

            // Cache for 5 minutes
            cacheService.set(cacheKey, data, 300);
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

            if (cachedData) {
                console.log(`Using cached data for player ${playerTag}`);
                return cachedData;
            }

            const formattedTag = this.formatTag(playerTag);
            console.log(`Getting player data for: ${formattedTag}`);
            const data = await this.executeRequest(`/players/${formattedTag}`, { timeout: 3000 });

            // Cache for 5 minutes
            cacheService.set(cacheKey, data, 300);
            return data;
        } catch (error) {
            console.error(`Error getting player data:`, error.message);
            throw error;
        }
    }

    async searchClans(params = {}) {
        try {
            console.log(`Searching clans with parameters:`, params);
            return await this.executeRequest('/clans', {
                params,
                timeout: 3000
            });
        } catch (error) {
            console.error(`Error searching clans:`, error.message);
            throw error;
        }
    }

    async getCurrentWar(clanTag) {
        try {
            const cacheKey = `currentWar:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);

            if (cachedData) {
                console.log(`Using cached data for war ${clanTag}`);
                return cachedData;
            }

            const formattedTag = this.formatTag(clanTag);
            console.log(`Getting current war for clan: ${formattedTag}`);
            const data = await this.executeRequest(`/clans/${formattedTag}/currentwar`, { timeout: 3000 });

            // Cache for 2 minutes (wars change more frequently)
            cacheService.set(cacheKey, data, 120);
            return data;
        } catch (error) {
            console.error(`Error getting current war:`, error.message);

            // Special handling for "not in war" error - this allows /war command to work even if clan isn't in war
            if (error.message.includes('403') || error.message.includes('404')) {
                console.log('Clan might not be in war - returning null instead of error');
                return { state: 'notInWar' };
            }

            throw error;
        }
    }

    async testProxyConnection() {
        try {
            console.log('Testing proxy connection...');
            await this.verifyProxyIP();

            return {
                success: true,
                proxyIP: this.currentProxyIP,
                message: `Proxy connection successful. Using IP: ${this.currentProxyIP}`,
                proxyConfigured: this.proxyConfigured
            };
        } catch (error) {
            console.error('Proxy test failed:', error.message);
            this.lastError = error;

            return {
                success: false,
                error: error.message,
                message: 'Proxy connection failed',
                proxyConfigured: this.proxyConfigured
            };
        }
    }

    /**
     * Get API status information
     * @returns {Object} Status information
     */
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

    /**
     * Get Clan Capital raid seasons
     * @param {string} clanTag Clan tag
     * @param {Object} params Optional parameters
     * @returns {Promise<Object>} Raid seasons data
     */
    async getCapitalRaidSeasons(clanTag, params = {}) {
        try {
            const cacheKey = `capitalRaidSeasons:${clanTag}`;
            const cachedData = cacheService.get(cacheKey);

            if (cachedData) {
                console.log(`Using cached data for Capital raid seasons ${clanTag}`);
                return cachedData;
            }

            const formattedTag = this.formatTag(clanTag);
            console.log(`Getting capital raid seasons for clan: ${formattedTag}`);
            const data = await this.executeRequest(`/clans/${formattedTag}/capitalraidseasons`, {
                params,
                timeout: 3000
            });

            // Cache for 5 minutes
            cacheService.set(cacheKey, data, 300);
            return data;
        } catch (error) {
            console.error(`Error getting capital raid seasons:`, error.message);
            throw error;
        }
    }

    /**
     * Get CWL war data
     * @param {string} warTag War tag
     * @returns {Promise<Object>} CWL war data
     */
    async getCWLWar(warTag) {
        try {
            const cacheKey = `cwlWar:${warTag}`;
            const cachedData = cacheService.get(cacheKey);

            if (cachedData) {
                console.log(`Using cached data for CWL war ${warTag}`);
                return cachedData;
            }

            console.log(`Getting CWL war with tag: ${warTag}`);
            const data = await this.executeRequest(`/clanwarleagues/wars/${encodeURIComponent(warTag)}`, {
                timeout: 3000
            });

            // Cache for 5 minutes
            cacheService.set(cacheKey, data, 300);
            return data;
        } catch (error) {
            console.error(`Error getting CWL war:`, error.message);
            throw error;
        }
    }
}



module.exports = new ClashApiService();