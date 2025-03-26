// src/services/clashApiService.js
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 3; // Number of retries for failed requests
        this.proxyConfigured = false;
        this.currentProxyIP = null;

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

            // Test proxy connection immediately
            this.verifyProxyIP().catch(err => {
                console.error('Error verifying proxy IP at startup:', err.message);
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

            const response = await client.get('https://api.ipify.org?format=json');
            this.currentProxyIP = response.data.ip;

            console.log(`Current proxy IP: ${this.currentProxyIP}`);
            console.log(`If you're getting 403 errors, ensure this IP is whitelisted: ${this.currentProxyIP}`);

            return this.currentProxyIP;
        } catch (error) {
            console.error('Failed to verify proxy IP:', error.message);
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
                timeout: 10000
            });
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

        // Clean the API key to remove any whitespace
        const cleanApiKey = apiKey.trim();

        // Create the client first
        const client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000
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
                console.log(`Using proxy URL format: http://[username]:[password]@${proxyHost}:${proxyPort}`);

                // Create proxy agent
                const httpsAgent = new HttpsProxyAgent(proxyUrl);

                // Configure client with proxy
                client.defaults.httpsAgent = httpsAgent;
                client.defaults.proxy = false; // This tells axios to use the httpsAgent
                this.proxyConfigured = true;

                console.log(`Proxy configured for API requests`);
            } catch (error) {
                console.error('Error setting up proxy:', error.message);
                this.proxyConfigured = false;
            }
        }

        return client;
    }

    formatTag(tag) {
        if (!tag) {
            throw new Error('Tag is required');
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

        // Make sure we have the current proxy IP
        if (this.proxyConfigured && !this.currentProxyIP) {
            try {
                await this.verifyProxyIP();
            } catch (err) {
                console.warn('Could not verify proxy IP before request:', err.message);
            }
        }

        // Try up to retryCount times
        let lastError = null;

        for (let attempt = 0; attempt < this.retryCount; attempt++) {
            try {
                console.log(`Attempt ${attempt + 1}/${this.retryCount}`);

                const client = this.getClient();

                // Print request info for debugging
                console.log(`Request details:
                  URL: ${this.baseUrl}${endpoint}
                  Method: ${options.method || 'GET'}
                  Using proxy: ${this.proxyConfigured ? 'Yes' : 'No'}
                  Proxy IP: ${this.currentProxyIP || 'Unknown'}`);

                const response = await client.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });

                console.log(`Request successful: Status ${response.status}`);
                return response.data;

            } catch (error) {
                console.error(`Request failed:`, error.message);

                // Log more detailed error information
                if (error.response) {
                    console.error('Response status:', error.response.status);
                    console.error('Response data:', JSON.stringify(error.response.data, null, 2));

                    // Check specifically for IP whitelist issues
                    if (error.response.status === 403 &&
                        error.response.data &&
                        error.response.data.message &&
                        error.response.data.message.includes('IP')) {

                        console.error('IP WHITELIST ERROR DETECTED!');
                        console.error(`Make sure IP ${this.currentProxyIP || 'Unknown'} is whitelisted at developer.clashofclans.com`);

                        // Try to get the current IP again to verify
                        try {
                            await this.verifyProxyIP();
                            console.error(`Verified current proxy IP: ${this.currentProxyIP}`);
                        } catch (ipErr) {
                            console.error('Could not verify current IP:', ipErr.message);
                        }
                    }
                } else if (error.request) {
                    console.error('No response received from request');
                }

                lastError = error;

                // Only retry on connection/timeout errors or 503 errors (service unavailable)
                const shouldRetry =
                    !error.response ||
                    error.response.status === 503 ||
                    error.code === 'ECONNABORTED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNRESET';

                if (!shouldRetry) {
                    console.log('Error is not retryable, breaking retry loop');
                    break;
                }

                // Wait before retrying
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // All attempts failed
        console.error(`All ${this.retryCount} attempts failed for ${endpoint}`);

        if (lastError.response) {
            const status = lastError.response.status;
            const message = lastError.response.data?.message || lastError.message;

            if (status === 403) {
                throw new Error(`Access denied. The IP address (${this.currentProxyIP || 'Unknown'}) is not whitelisted in the Clash of Clans API. Status: ${status}`);
            } else if (status === 404) {
                throw new Error(`Not found: ${endpoint}. Status: ${status}`);
            } else {
                throw new Error(`API error: ${message}. Status: ${status}`);
            }
        } else {
            throw new Error(`Network error: ${lastError.message}`);
        }
    }

    // API methods
    async getClan(clanTag) {
        try {
            const formattedTag = this.formatTag(clanTag);
            console.log(`Getting clan data for: ${formattedTag}`);
            return await this.executeRequest(`/clans/${formattedTag}`);
        } catch (error) {
            console.error(`Error getting clan data:`, error.message);
            throw error;
        }
    }

    async getPlayer(playerTag) {
        try {
            const formattedTag = this.formatTag(playerTag);
            console.log(`Getting player data for: ${formattedTag}`);
            return await this.executeRequest(`/players/${formattedTag}`);
        } catch (error) {
            console.error(`Error getting player data:`, error.message);
            throw error;
        }
    }

    async searchClans(params = {}) {
        try {
            console.log(`Searching clans with parameters:`, params);
            return await this.executeRequest('/clans', { params });
        } catch (error) {
            console.error(`Error searching clans:`, error.message);
            throw error;
        }
    }

    async getCurrentWar(clanTag) {
        try {
            const formattedTag = this.formatTag(clanTag);
            console.log(`Getting current war for clan: ${formattedTag}`);
            return await this.executeRequest(`/clans/${formattedTag}/currentwar`);
        } catch (error) {
            console.error(`Error getting current war:`, error.message);
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

            return {
                success: false,
                error: error.message,
                message: 'Proxy connection failed',
                proxyConfigured: this.proxyConfigured
            };
        }
    }
}

module.exports = new ClashApiService();