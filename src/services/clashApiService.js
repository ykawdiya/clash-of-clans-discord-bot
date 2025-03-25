const axios = require('axios');
const https = require('https');
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

        // Create configuration for axios
        const config = {
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 15000, // 15 second timeout
            // Custom HTTPS agent with longer timeout
            httpsAgent: new https.Agent({
                keepAlive: true,
                timeout: 20000
            })
        };

        // Add proxy if all proxy details are provided
        if (proxyHost && proxyPort && proxyUser && proxyPass) {
            try {
                // Build proxy URL
                const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
                console.log(`Setting up proxy with host: ${proxyHost}`);

                // Create proxy agent with increased timeout
                const httpsAgent = new HttpsProxyAgent({
                    host: proxyHost,
                    port: proxyPort,
                    auth: `${proxyUser}:${proxyPass}`,
                    timeout: 15000,
                    rejectUnauthorized: false // Try disabling SSL verification if needed
                });

                // Use the proxy agent
                config.httpsAgent = httpsAgent;
                config.proxy = false; // Tell axios to use httpsAgent instead
            } catch (error) {
                console.error('Error setting up proxy agent:', error.message);
                // Continue without proxy if setup fails
            }
        } else {
            console.warn('Proxy configuration incomplete, using direct connection');
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
            timeout: 10000
        });
    }

    /**
     * Get clan information by tag
     * @param {string} clanTag - Clan tag without # or with URL encoded #
     * @returns {Promise<Object>} Clan data
     */
    async getClan(clanTag) {
        // Ensure the tag is properly formatted
        const formattedTag = clanTag.startsWith('#')
            ? encodeURIComponent(clanTag)
            : encodeURIComponent(`#${clanTag}`);

        console.log(`Fetching clan data for tag: ${formattedTag}`);

        try {
            // First try with proxy client
            const client = this.getClient();
            const response = await client.get(`/clans/${formattedTag}`);
            return response.data;
        } catch (error) {
            // Log the initial error
            console.error(`Proxy request failed: ${error.message}`);

            // If no response was received, try direct connection as fallback
            if (error.request && !error.response) {
                console.log('No response from proxy, trying direct connection as fallback...');
                try {
                    // Create a direct client without proxy
                    const directClient = this.getDirectClient();
                    const directResponse = await directClient.get(`/clans/${formattedTag}`);
                    console.log('Direct connection succeeded!');
                    return directResponse.data;
                } catch (directError) {
                    console.error(`Direct connection also failed: ${directError.message}`);
                    this.logError('clan data (direct)', directError);
                    throw directError;
                }
            }

            // For other types of errors, just log and rethrow
            this.logError('clan data', error);
            throw error;
        }
    }

    /**
     * Get player information by tag
     * @param {string} playerTag - Player tag without # or with URL encoded #
     * @returns {Promise<Object>} Player data
     */
    async getPlayer(playerTag) {
        // Ensure the tag is properly formatted
        const formattedTag = playerTag.startsWith('#')
            ? encodeURIComponent(playerTag)
            : encodeURIComponent(`#${playerTag}`);

        console.log(`Fetching player data for tag: ${formattedTag}`);

        try {
            // First try with proxy client
            const client = this.getClient();
            const response = await client.get(`/players/${formattedTag}`);
            return response.data;
        } catch (error) {
            // Log the initial error
            console.error(`Proxy request failed: ${error.message}`);

            // If no response was received, try direct connection as fallback
            if (error.request && !error.response) {
                console.log('No response from proxy, trying direct connection as fallback...');
                try {
                    // Create a direct client without proxy
                    const directClient = this.getDirectClient();
                    const directResponse = await directClient.get(`/players/${formattedTag}`);
                    console.log('Direct connection succeeded!');
                    return directResponse.data;
                } catch (directError) {
                    console.error(`Direct connection also failed: ${directError.message}`);
                    this.logError('player data (direct)', directError);
                    throw directError;
                }
            }

            // For other types of errors, just log and rethrow
            this.logError('player data', error);
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
            // First try with proxy client
            const client = this.getClient();
            const response = await client.get('/clans', { params });
            return response.data;
        } catch (error) {
            // Log the initial error
            console.error(`Proxy request failed: ${error.message}`);

            // If no response was received, try direct connection as fallback
            if (error.request && !error.response) {
                console.log('No response from proxy, trying direct connection as fallback...');
                try {
                    // Create a direct client without proxy
                    const directClient = this.getDirectClient();
                    const directResponse = await directClient.get('/clans', { params });
                    console.log('Direct connection succeeded!');
                    return directResponse.data;
                } catch (directError) {
                    console.error(`Direct connection also failed: ${directError.message}`);
                    this.logError('clan search (direct)', directError);
                    throw directError;
                }
            }

            // For other types of errors, just log and rethrow
            this.logError('clan search', error);
            throw error;
        }
    }

    /**
     * Get clan's current war information
     * @param {string} clanTag - Clan tag
     * @returns {Promise<Object>} Current war data
     */
    async getCurrentWar(clanTag) {
        // Ensure the tag is properly formatted
        const formattedTag = clanTag.startsWith('#')
            ? encodeURIComponent(clanTag)
            : encodeURIComponent(`#${clanTag}`);

        try {
            // First try with proxy client
            const client = this.getClient();
            const response = await client.get(`/clans/${formattedTag}/currentwar`);
            return response.data;
        } catch (error) {
            // If no response was received, try direct connection as fallback
            if (error.request && !error.response) {
                console.log('No response from proxy, trying direct connection as fallback...');
                try {
                    // Create a direct client without proxy
                    const directClient = this.getDirectClient();
                    const directResponse = await directClient.get(`/clans/${formattedTag}/currentwar`);
                    return directResponse.data;
                } catch (directError) {
                    this.logError('current war data (direct)', directError);
                    throw directError;
                }
            }

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
        // Ensure the tag is properly formatted
        const formattedTag = clanTag.startsWith('#')
            ? encodeURIComponent(clanTag)
            : encodeURIComponent(`#${clanTag}`);

        try {
            // First try with proxy client
            const client = this.getClient();
            const response = await client.get(`/clans/${formattedTag}/currentwar/leaguegroup`);
            return response.data;
        } catch (error) {
            // If no response was received, try direct connection as fallback
            if (error.request && !error.response) {
                console.log('No response from proxy, trying direct connection as fallback...');
                try {
                    // Create a direct client without proxy
                    const directClient = this.getDirectClient();
                    const directResponse = await directClient.get(`/clans/${formattedTag}/currentwar/leaguegroup`);
                    return directResponse.data;
                } catch (directError) {
                    this.logError('CWL data (direct)', directError);
                    throw directError;
                }
            }

            this.logError('CWL data', error);
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
                console.error('Check if the IP is whitelisted in Clash of Clans API');
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

            // Try direct connection to see if that works
            try {
                const directClient = this.getDirectClient();
                const directResponse = await directClient.get('https://api.ipify.org?format=json');

                return {
                    success: false,
                    directSuccess: true,
                    proxyError: error.message,
                    directIP: directResponse.data.ip,
                    message: 'Proxy failed but direct connection works'
                };
            } catch (directError) {
                return {
                    success: false,
                    directSuccess: false,
                    proxyError: error.message,
                    directError: directError.message,
                    message: 'Both proxy and direct connections failed'
                };
            }
        }
    }
}

module.exports = new ClashApiService();