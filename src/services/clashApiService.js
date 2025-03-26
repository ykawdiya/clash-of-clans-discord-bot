// src/services/clashApiService.js
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.retryCount = 3; // Number of retries for failed requests

        // Store the proxy setup status
        this.proxyConfigured = false;
        this.proxySetupAttempted = false;

        // Cache for successful client types to avoid inconsistencies
        this.successfulClientType = null;
    }

    /**
     * Create a fresh client with the latest API key and WebShare proxy
     * @returns {axios.AxiosInstance}
     */
    getClient() {
        const apiKey = process.env.COC_API_KEY;

        if (!apiKey) {
            console.error('COC_API_KEY environment variable is not set');
            throw new Error('Clash of Clans API key is not configured');
        }

        // If we've already had success with direct client, use that consistently
        if (this.successfulClientType === 'direct') {
            return this.getDirectClient();
        }

        // WebShare proxy configuration
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        // Create configuration for axios with longer timeouts
        const config = {
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 45000, // 45 second timeout
            httpsAgent: new https.Agent({
                keepAlive: true,
                timeout: 60000 // 60 second timeout
            })
        };

        // Add proxy if all proxy details are provided
        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            this.proxySetupAttempted = true;
            try {
                // Build proxy URL
                const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
                console.log(`Setting up proxy with host: ${proxyHost}`);

                // Create proxy agent with increased timeout
                const httpsAgent = new HttpsProxyAgent({
                    host: proxyHost,
                    port: proxyPort,
                    auth: `${proxyUser}:${proxyPass}`,
                    timeout: 45000,
                    rejectUnauthorized: false
                });

                // Use the proxy agent
                config.httpsAgent = httpsAgent;
                config.proxy = false; // Tell axios to use httpsAgent instead
                this.proxyConfigured = true;
            } catch (error) {
                console.error('Error setting up proxy agent:', error.message);
                this.proxyConfigured = false;
                // Continue without proxy if setup fails
            }
        } else {
            console.warn('Proxy configuration incomplete, using direct connection');
            this.proxyConfigured = false;
        }

        // Create and return axios client
        return axios.create(config);
    }

    /**
     * Get a direct client without proxy (fallback)
     * @returns {axios.AxiosInstance}
     */
    getDirectClient() {
        const apiKey = process.env.COC_API_KEY;

        if (!apiKey) {
            console.error('COC_API_KEY environment variable is not set');
            throw new Error('Clash of Clans API key is not configured');
        }

        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 30000, // 30 second timeout
            httpsAgent: new https.Agent({
                keepAlive: true,
                timeout: 40000 // 40 second timeout for the agent
            })
        });
    }

    /**
     * Ensure consistent formatting of clan tags
     * @param {string} tag - The clan or player tag
     * @returns {string} - Properly formatted tag
     */
    formatTag(tag) {
        if (!tag) {
            throw new Error('Tag is required');
        }

        // Remove any whitespace
        tag = tag.trim();

        // Add # if missing
        if (!tag.startsWith('#')) {
            tag = '#' + tag;
        }

        // Convert to uppercase (API is case-sensitive)
        tag = tag.toUpperCase();

        // URL encode the tag
        return encodeURIComponent(tag);
    }

    /**
     * Execute a request with retry logic
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    async executeRequest(endpoint, options = {}) {
        // Log request details for debugging
        console.log(`Request details:`, {
            endpoint,
            method: options.method || 'get',
            params: options.params,
            usingProxy: this.proxyConfigured,
            successfulClientType: this.successfulClientType
        });

        // If we've had success with a specific client type, use that consistently
        if (this.successfulClientType === 'direct') {
            try {
                console.log(`Using direct client (based on previous success) for ${endpoint}`);
                const directClient = this.getDirectClient();
                const response = await directClient.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });
                console.log(`Request successful with direct client`);
                return response.data;
            } catch (err) {
                console.error(`Direct client failed despite previous success:`, err.message);
                // Reset the successful client type and continue with normal flow
                this.successfulClientType = null;
            }
        }

        // Try proxy client first with retries
        let error;
        if (this.proxyConfigured) {
            for (let attempt = 0; attempt < this.retryCount; attempt++) {
                try {
                    console.log(`Proxy attempt ${attempt + 1}/${this.retryCount} for ${endpoint}`);
                    const client = this.getClient();
                    const response = await client.request({
                        url: endpoint,
                        method: options.method || 'get',
                        params: options.params,
                        data: options.data
                    });
                    console.log(`Request successful on proxy attempt ${attempt + 1}`);
                    // Store successful client type
                    this.successfulClientType = 'proxy';
                    return response.data;
                } catch (err) {
                    console.error(`Proxy attempt ${attempt + 1} failed: ${err.message}`);
                    error = err;

                    // Only retry if it's a timeout or connection error
                    if (err.response || (err.code !== 'ECONNABORTED' &&
                        err.code !== 'ETIMEDOUT' &&
                        err.code !== 'ECONNRESET' &&
                        !err.message.includes('timeout'))) {
                        break; // Don't retry if it's not a timeout/connection issue
                    }

                    // Wait before retry (exponential backoff)
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, etc.
                    console.log(`Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } else {
            console.log(`Skipping proxy attempts as proxy is not configured`);
        }

        // If proxy failed or wasn't configured, try direct client with retries
        for (let attempt = 0; attempt < this.retryCount; attempt++) {
            try {
                console.log(`Direct attempt ${attempt + 1}/${this.retryCount} for ${endpoint}`);
                const directClient = this.getDirectClient();
                const response = await directClient.request({
                    url: endpoint,
                    method: options.method || 'get',
                    params: options.params,
                    data: options.data
                });
                console.log(`Request successful on direct attempt ${attempt + 1}`);
                // Store successful client type
                this.successfulClientType = 'direct';
                return response.data;
            } catch (err) {
                console.error(`Direct attempt ${attempt + 1} failed: ${err.message}`);
                error = err;

                // Only retry if it's a timeout or connection error
                if (err.response || (err.code !== 'ECONNABORTED' &&
                    err.code !== 'ETIMEDOUT' &&
                    err.code !== 'ECONNRESET' &&
                    !err.message.includes('timeout'))) {
                    break; // Don't retry if it's not a timeout/connection issue
                }

                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, etc.
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // If we get here, all attempts failed
        this.logError(`all attempts for ${endpoint}`, error);
        this.handleApiError(endpoint, error);
    }

    /**
     * Get clan information by tag
     * @param {string} clanTag - Clan tag without # or with URL encoded #
     * @returns {Promise<Object>} Clan data
     */
    async getClan(clanTag) {
        try {
            // Use our consistent tag formatter
            const formattedTag = this.formatTag(clanTag);
            console.log(`Fetching clan data for tag: ${formattedTag} (original: ${clanTag})`);
            return await this.executeRequest(`/clans/${formattedTag}`);
        } catch (error) {
            console.error(`Error in getClan for tag ${clanTag}:`, error.message);
            throw error;
        }
    }

    /**
     * Get player information by tag
     * @param {string} playerTag - Player tag without # or with URL encoded #
     * @returns {Promise<Object>} Player data
     */
    async getPlayer(playerTag) {
        try {
            // Use our consistent tag formatter
            const formattedTag = this.formatTag(playerTag);
            console.log(`Fetching player data for tag: ${formattedTag} (original: ${playerTag})`);
            return await this.executeRequest(`/players/${formattedTag}`);
        } catch (error) {
            console.error(`Error in getPlayer for tag ${playerTag}:`, error.message);
            throw error;
        }
    }

    /**
     * Search for clans by name
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Clan search results
     */
    async searchClans(params = {}) {
        try {
            console.log(`Searching clans with params:`, params);
            return await this.executeRequest('/clans', { params });
        } catch (error) {
            console.error(`Error in searchClans:`, error.message);
            throw error;
        }
    }

    /**
     * Get clan's current war information
     * @param {string} clanTag - Clan tag
     * @returns {Promise<Object>} Current war data
     */
    async getCurrentWar(clanTag) {
        try {
            // Use our consistent tag formatter
            const formattedTag = this.formatTag(clanTag);
            console.log(`Fetching war data for clan tag: ${formattedTag} (original: ${clanTag})`);
            return await this.executeRequest(`/clans/${formattedTag}/currentwar`);
        } catch (error) {
            console.error(`Error in getCurrentWar for tag ${clanTag}:`, error.message);
            throw error;
        }
    }

    /**
     * Get clan war league information
     * @param {string} clanTag - Clan tag
     * @returns {Promise<Object>} CWL data
     */
    async getClanWarLeagueGroup(clanTag) {
        try {
            // Use our consistent tag formatter
            const formattedTag = this.formatTag(clanTag);
            console.log(`Fetching CWL data for clan tag: ${formattedTag} (original: ${clanTag})`);
            return await this.executeRequest(`/clans/${formattedTag}/currentwar/leaguegroup`);
        } catch (error) {
            console.error(`Error in getClanWarLeagueGroup for tag ${clanTag}:`, error.message);
            throw error;
        }
    }

    /**
     * Log detailed error information
     * @param {string} context - Context of the error
     * @param {Error} error - Error object
     */
    logError(context, error) {
        console.error(`Error fetching ${context}:`, error.message);

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Status:', error.response.status);
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Data:', JSON.stringify(error.response.data, null, 2));

            // Add request details for debugging
            if (error.config) {
                console.error('Request URL:', error.config.url);
                console.error('Request Method:', error.config.method);
                console.error('Request Headers:', JSON.stringify(error.config.headers, null, 2));
            }

            if (error.response.status === 403) {
                console.error('\nAPI ACCESS DENIED: There may be an issue with the proxy or API key');
                console.error('Check if the IP is whitelisted in Clash of Clans API');
                console.error(`Using proxy: ${this.proxyConfigured ? 'Yes' : 'No'}`);
                console.error(`Successful client type: ${this.successfulClientType || 'None'}`);
            } else if (error.response.status === 401) {
                console.error('\nAPI KEY INVALID: Check your COC_API_KEY environment variable');
            } else if (error.response.status === 429) {
                console.error('\nRATE LIMIT EXCEEDED: Too many requests to the CoC API');
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received from API');
            console.error('This could be due to:');
            console.error('1. Network connectivity issues');
            console.error('2. Proxy authentication failure');
            console.error('3. SSL/TLS issues');
            console.error('4. Request timeout');

            // Log additional error properties that might help diagnose
            if (error.code) console.error('Error code:', error.code);
            if (error.syscall) console.error('System call:', error.syscall);
            if (error.address) console.error('Address:', error.address);
            if (error.port) console.error('Port:', error.port);
            if (error.config && error.config.timeout) console.error('Timeout setting:', error.config.timeout);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error setting up request:', error.message);
            if (error.stack) console.error('Stack trace:', error.stack);
        }
    }

    /**
     * Comprehensive error recovery with better logging
     * @param {string} endpoint - The API endpoint being accessed
     * @param {Error} error - The error that occurred
     * @throws {Error} - Rethrows error with more context
     */
    handleApiError(endpoint, error) {
        // Log detailed error info
        console.error(`API Error accessing ${endpoint}:`, error.message);

        // Extract useful information for debugging
        const errorDetails = {
            timestamp: new Date().toISOString(),
            endpoint,
            message: error.message,
            code: error.code,
            statusCode: error.response?.status,
            responseData: error.response?.data,
            isNetworkError: !error.response && error.request,
            usingProxy: this.proxyConfigured,
            successfulClientType: this.successfulClientType,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        };

        // Create a user-friendly error object
        let userFriendlyError;

        // Handle different error types
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ||
            error.message.includes('timeout')) {
            // Timeout errors
            userFriendlyError = new Error("Request Timeout: The Clash of Clans API is taking too long to respond. Please try again later.");
            userFriendlyError.code = "REQUEST_TIMEOUT";
        } else if (error.code === 'ECONNRESET') {
            // Connection reset errors
            userFriendlyError = new Error("Connection Reset: The connection to the Clash of Clans API was reset. Please try again later.");
            userFriendlyError.code = "CONNECTION_RESET";
        } else if (error.response) {
            // HTTP response errors
            if (error.response.status === 404) {
                userFriendlyError = new Error("Not Found: The requested clan or player could not be found. Please check the tag and try again.");
                userFriendlyError.code = "NOT_FOUND";
            } else if (error.response.status === 403) {
                userFriendlyError = new Error("Access Denied: Unable to access the Clash of Clans API. The IP address may not be whitelisted.");
                userFriendlyError.code = "ACCESS_DENIED";
            } else if (error.response.status === 429) {
                userFriendlyError = new Error("Rate Limited: Too many requests to the Clash of Clans API. Please try again later.");
                userFriendlyError.code = "RATE_LIMITED";
            } else {
                userFriendlyError = new Error(`API Error (${error.response.status}): An error occurred while communicating with the Clash of Clans API.`);
                userFriendlyError.code = "API_ERROR";
            }
        } else {
            // Generic network errors
            userFriendlyError = new Error("Network Error: Could not connect to the Clash of Clans API. Please check your internet connection and try again.");
            userFriendlyError.code = "NETWORK_ERROR";
        }

        // Copy over the error details
        userFriendlyError.details = errorDetails;
        userFriendlyError.originalError = error;

        // Log structured error details for easier debugging
        console.error('Full error details:', JSON.stringify(errorDetails, null, 2));

        // Throw the user-friendly error
        throw userFriendlyError;
    }

    /**
     * Test the proxy connection
     * @returns {Promise<Object>} Test result
     */
    async testProxyConnection() {
        try {
            // Create a client with the proxy
            const client = this.getClient();

            // Test with a public IP echo service
            const response = await client.get('https://api.ipify.org?format=json');

            return {
                success: true,
                proxyIP: response.data.ip,
                message: 'Proxy connection successful',
                proxyConfigured: this.proxyConfigured,
                proxySetupAttempted: this.proxySetupAttempted
            };
        } catch (error) {
            console.error('Proxy connection test failed:', error.message);

            // Try direct connection to see if that works
            try {
                const directClient = this.getDirectClient();
                const directResponse = await directClient.get('https://api.ipify.org?format=json');

                return {
                    success: false,
                    directSuccess: true,
                    proxyError: error.message,
                    directIP: directResponse.data.ip,
                    message: 'Proxy failed but direct connection works',
                    proxyConfigured: this.proxyConfigured,
                    proxySetupAttempted: this.proxySetupAttempted
                };
            } catch (directError) {
                return {
                    success: false,
                    directSuccess: false,
                    proxyError: error.message,
                    directError: directError.message,
                    message: 'Both proxy and direct connections failed',
                    proxyConfigured: this.proxyConfigured,
                    proxySetupAttempted: this.proxySetupAttempted
                };
            }
        }
    }
}

// Debug logging for proxy configuration
console.log('Proxy Configuration Debug:', {
    proxyHost: process.env.PROXY_HOST,
    proxyPort: process.env.PROXY_PORT,
    proxyUser: process.env.PROXY_USERNAME ? 'SET' : 'NOT SET',
    proxyPass: process.env.PROXY_PASSWORD ? 'SET' : 'NOT SET',
    successfulClientType: this.successfulClientType,
    clanTag: clanTag
});

// Force proxy usage for specific clans or conditions
const forceProxyClans = ['#2RUVGR2QQ']; // Replace with your clan's tag
if (forceProxyClans.includes(clanTag)) {
    console.log(`Forcing proxy usage for clan ${clanTag}`);
    this.successfulClientType = null; // Reset to force proxy reconfiguration
}

module.exports = new ClashApiService();