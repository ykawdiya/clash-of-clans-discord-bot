const axios = require('axios');

class ClashApiService {
    constructor() {
        this.apiKey = process.env.COC_API_KEY;
        this.baseUrl = 'https://api.clashofclans.com/v1';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Get player information by tag
     * @param {string} playerTag - Player tag without # or with URL encoded #
     * @returns {Promise<Object>} Player data
     */
    async getPlayer(playerTag) {
        try {
            // Ensure the tag is properly formatted (remove # if present)
            const formattedTag = playerTag.startsWith('#')
                ? encodeURIComponent(playerTag)
                : encodeURIComponent(`#${playerTag}`);

            const response = await this.client.get(`/players/${formattedTag}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching player data:', error.response?.data || error.message);
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
            // Ensure the tag is properly formatted (remove # if present)
            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            const response = await this.client.get(`/clans/${formattedTag}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching clan data:', error.response?.data || error.message);
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
            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            const response = await this.client.get(`/clans/${formattedTag}/currentwar`);
            return response.data;
        } catch (error) {
            console.error('Error fetching current war data:', error.response?.data || error.message);
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
            const formattedTag = clanTag.startsWith('#')
                ? encodeURIComponent(clanTag)
                : encodeURIComponent(`#${clanTag}`);

            const response = await this.client.get(`/clans/${formattedTag}/currentwar/leaguegroup`);
            return response.data;
        } catch (error) {
            console.error('Error fetching CWL data:', error.response?.data || error.message);
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
            const response = await this.client.get('/clans', { params });
            return response.data;
        } catch (error) {
            console.error('Error searching clans:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new ClashApiService();