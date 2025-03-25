const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ClashApiService {
    constructor() {
        this.baseUrl = 'https://api.clashofclans.com/v1';
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

        // WebShare proxy configuration
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUser = process.env.PROXY_USERNAME;
        const proxyPass = process.env.PROXY_PASSWORD;

        if (!proxyHost || !proxyPort || !proxyUser || !proxyPass) {
            console.error('WebShare proxy configuration is incomplete');
            throw new Error('Missing proxy configuration. Check your environment variables.');
        }

        // Build proxy URL
        const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
        console.log(`Setting up proxy with host: ${proxyHost}`);

        // Create proxy agent
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        // Create and return axios client with proxy configuration
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            httpsAgent,
            proxy: false // This tells axios to use the httpsAgent instead of its built-in proxy handling
        });
    }

    /**
     * Get player information by tag
     * @param {string} playerTag - Player tag without # or with URL encoded #
     * @returns {Promise<Object>} Player data
     */
    async getPlayer(playerTag) {
        try {
            // Create a fresh client for each request
            const client = this.getClient();

            // Ensure the tag is properly formatted (remove # if present)
            const formattedTag = playerTag.startsWith('#')
                ? encodeURIComponent(playerTag)
                : encodeURIComponent(`#${playerTag}`);

            console.log(`Fetching player data for tag: ${formattedTag}`);
            const response = await client.get(`/players/${formattedTag}`);
            return response.data;
        } catch (error) {
            this.logError('player data', error);
            throw error;
        }
    }

    /**
     * Get clan information by tag
     * @param {string} clanTag - Clan tag without # or with URL encoded #
     * @returns {Promise<Object>} Clan data
     */
    async getClan(clanTag) {
        try {
            // Create a fresh client for each request
            const client = this.getClient();

            // Ensure the tag is properly formatted (remove # if present)
            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            console.log(`Fetching clan data for tag: ${formattedTag}`);
            const response = await client.get(`/clans/${formattedTag}`);
            return response.data;
        } catch (error) {
            this.logError('clan data', error);
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
            // Create a fresh client for each request
            const client = this.getClient();

            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            const response = await client.get(`/clans/${formattedTag}/currentwar`);
            return response.data;
        } catch (error) {
            this.logError('current war data', error);
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
            // Create a fresh client for each request
            const client = this.getClient();

            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            const response = await client.get(`/clans/${formattedTag}/currentwar/leaguegroup`);
            return response.data;
        } catch (error) {
            this.logError('CWL data', error);
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
            // Create a fresh client for each request
            const client = this.getClient();

            const response = await client.get('/clans', { params });
            return response.data;
        } catch (error) {
            this.logError('clan search', error);
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

            if (error.response.status === 403) {
                console.error('\nAPI ACCESS DENIED: There may be an issue with the proxy or API key');
                console.error('Check if the proxy IP is whitelisted in Clash of Clans API');
            } else if (error.response.status === 401) {
                console.error('\nAPI KEY INVALID: Check your COC_API_KEY environment variable');
            } else if (error.response.status === 429) {
                console.error('\nRATE LIMIT EXCEEDED: Too many requests to the CoC API');
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received from API');
            console.error('WebShare proxy configuration may be incorrect');
            console.error('Check if your proxy is online and credentials are correct');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error setting up request:', error.message);
        }
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
                message: 'Proxy connection successful'
            };
        } catch (error) {
            console.error('Proxy connection test failed:', error.message);

            return {
                success: false,
                error: error.message,
                message: 'Proxy connection test failed'
            };
        }
    }
}

module.exports = new ClashApiService();