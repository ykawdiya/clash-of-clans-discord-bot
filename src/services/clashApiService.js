// src/services/clashApiService.js
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 3; // Number of retries for failed requests
        this.proxyConfigured = false;

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
        } else {
            this.proxyConfigured = false;
            console.warn('Proxy configuration is incomplete - all requests will use direct connection');
        }
    }

    getClient() {
        const apiKey = process.env.COC_API_KEY;

        if (!apiKey) {
            throw new Error('Clash of Clans API key is not configured');
        }

        // Create basic client config
        const config = {
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        // Try to set up proxy
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        // Only add proxy if all values are provided
        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            try {
                // Create proxy agent
                const httpsAgent = new HttpsProxyAgent({
                    host: proxyHost,
                    port: proxyPort,
                    auth: `${proxyUser}:${proxyPass}`,
                    rejectUnauthorized: false
                });

                // Configure client with proxy
                config.httpsAgent = httpsAgent;
                config.proxy = false; // This tells axios to use the httpsAgent
                this.proxyConfigured = true;

                console.log(`Using proxy: ${proxyHost}:${proxyPort}`);
            } catch (error) {
                console.error('Error setting up proxy:', error.message);
                this.proxyConfigured = false;
            }
        }

        return axios.create(config);
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

        // Try up to retryCount times
        let lastError = null;

        for (let attempt = 0; attempt < this.retryCount; attempt++) {
            try {
                console.log(`Attempt ${attempt + 1}/${this.retryCount}`);

                const client = this.getClient();
                const response = await client.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });

                console.log(`Request successful`);
                return response.data;
            } catch (error) {
                console.error(`Request failed:`, error.message);
                lastError = error;

                // Only retry on connection/timeout errors
                if (error.response || (
                    error.code !== 'ECONNABORTED' &&
                    error.code !== 'ETIMEDOUT' &&
                    error.code !== 'ECONNRESET'
                )) {
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
                throw new Error(`Access denied. The IP address is not whitelisted in the Clash of Clans API. Status: ${status}`);
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
            const client = this.getClient();

            const response = await client.get('https://api.ipify.org?format=json');
            console.log(`Proxy connection successful. IP: ${response.data.ip}`);

            return {
                success: true,
                proxyIP: response.data.ip,
                message: 'Proxy connection successful',
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