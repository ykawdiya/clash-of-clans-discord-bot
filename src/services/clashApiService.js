// src/services/clashApiService.js
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 3; // Number of retries for failed requests
        this.proxyConfigured = false;

        // Check proxy settings on startup
        this.setupProxy();
    }

    setupProxy() {
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            console.log(`Proxy configured with host: ${proxyHost}:${proxyPort}`);
            this.proxyConfigured = true;
        } else {
            console.warn('Proxy settings incomplete. Some API features may not work.');
            this.proxyConfigured = false;
        }
    }

    getClient() {
        const apiKey = process.env.COC_API_KEY;

        if (!apiKey) {
            throw new Error('Clash of Clans API key is not configured');
        }

        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        // Create axios config
        const config = {
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        // Add proxy if all details are provided
        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            try {
                const httpsAgent = new HttpsProxyAgent({
                    host: proxyHost,
                    port: proxyPort,
                    auth: `${proxyUser}:${proxyPass}`,
                    rejectUnauthorized: false
                });

                config.httpsAgent = httpsAgent;
                config.proxy = false; // Let httpsAgent handle it
                this.proxyConfigured = true;

                console.log('Created client with proxy configuration');
            } catch (error) {
                console.error('Error setting up proxy:', error.message);
                throw new Error('Failed to set up proxy connection');
            }
        } else {
            throw new Error('Proxy configuration is required but incomplete');
        }

        return axios.create(config);
    }

    async executeRequest(endpoint, options = {}) {
        let lastError = null;

        for (let attempt = 0; attempt < this.retryCount; attempt++) {
            try {
                console.log(`Request attempt ${attempt + 1}/${this.retryCount} for ${endpoint}`);

                const client = this.getClient();
                const response = await client.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });

                console.log(`Request successful on attempt ${attempt + 1}`);
                return response.data;
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error.message);
                lastError = error;

                // Only retry on connection/timeout errors
                if (error.response ||
                    (error.code !== 'ECONNABORTED' &&
                        error.code !== 'ETIMEDOUT' &&
                        error.code !== 'ECONNRESET')) {
                    break;
                }

                // Wait before retry
                if (attempt < this.retryCount - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // If we got here, all attempts failed
        if (lastError.response) {
            const status = lastError.response.status;
            if (status === 404) {
                throw new Error(`Not found: ${endpoint}`);
            } else if (status === 403) {
                throw new Error(`Access denied. The proxy IP may not be whitelisted in the Clash of Clans API.`);
            } else {
                throw new Error(`API error (${status}): ${lastError.response.data?.message || lastError.message}`);
            }
        } else {
            throw new Error(`Request failed: ${lastError.message}`);
        }
    }

    formatTag(tag) {
        if (!tag) throw new Error('Tag is required');

        tag = tag.trim();
        if (!tag.startsWith('#')) tag = '#' + tag;
        return encodeURIComponent(tag.toUpperCase());
    }

    async getClan(clanTag) {
        const formattedTag = this.formatTag(clanTag);
        console.log(`Getting clan data for tag: ${formattedTag}`);
        return this.executeRequest(`/clans/${formattedTag}`);
    }

    async getPlayer(playerTag) {
        const formattedTag = this.formatTag(playerTag);
        console.log(`Getting player data for tag: ${formattedTag}`);
        return this.executeRequest(`/players/${formattedTag}`);
    }

    async searchClans(params = {}) {
        console.log(`Searching clans with params:`, params);
        return this.executeRequest('/clans', { params });
    }

    async getCurrentWar(clanTag) {
        const formattedTag = this.formatTag(clanTag);
        console.log(`Getting current war for clan: ${formattedTag}`);
        return this.executeRequest(`/clans/${formattedTag}/currentwar`);
    }

    async getClanWarLeagueGroup(clanTag) {
        const formattedTag = this.formatTag(clanTag);
        console.log(`Getting CWL group for clan: ${formattedTag}`);
        return this.executeRequest(`/clans/${formattedTag}/currentwar/leaguegroup`);
    }

    async testProxyConnection() {
        try {
            const client = this.getClient();
            const response = await client.get('https://api.ipify.org?format=json');

            return {
                success: true,
                proxyIP: response.data.ip,
                message: 'Proxy connection successful'
            };
        } catch (error) {
            console.error('Proxy test failed:', error.message);

            return {
                success: false,
                error: error.message,
                message: 'Proxy connection failed'
            };
        }
    }
}

module.exports = new ClashApiService();