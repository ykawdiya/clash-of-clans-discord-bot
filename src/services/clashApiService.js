// src/services/clashApiService.js
const axios = require('axios');
const { api: log } = require('../utils/logger');

class ClashApiService {
  constructor() {
    this.baseUrl = 'https://api.clashofclans.com/v1';
    this.token = process.env.CLASH_API_TOKEN;

    // Cache for API responses
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxRequestsPerSecond = 10;
    this.requestDelay = 1000 / this.maxRequestsPerSecond;

    // Log proxy configuration status
    if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
      log.info(`Proxy configuration found: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
    } else {
      log.info('No proxy configuration found, using direct connection');
    }
  }

  /**
   * Get axios instance with auth headers and proxy configuration
   * @returns {AxiosInstance} - Configured axios instance
   */
  getAxiosInstance() {
    const config = {
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json'
      }
    };

    // Add proxy configuration if provided in environment variables
    if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
      const proxyAuth = process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD
          ? `${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@`
          : '';

      const proxyUrl = `http://${proxyAuth}${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

      config.proxy = false; // Disable default proxy
      config.httpsAgent = new (require('https-proxy-agent'))(proxyUrl);

      log.info('Using proxy for Clash API requests');
    }

    return axios.create(config);
  }

  /**
   * Get from cache or fetch new data
   * @param {String} cacheKey - Cache key
   * @param {Function} fetchFn - Function to fetch data if not in cache
   * @returns {Promise<Object>} - Response data
   */
  async getOrFetch(cacheKey, fetchFn) {
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);

      if (cached.expiry > Date.now()) {
        log.debug(`Using cached data for ${cacheKey}`);
        return cached.data;
      }

      // Cache expired, remove it
      this.cache.delete(cacheKey);
    }

    // Fetch new data
    try {
      const data = await this.enqueueRequest(fetchFn);

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        expiry: Date.now() + this.cacheTTL
      });

      return data;
    } catch (error) {
      log.error(`API request failed for ${cacheKey}:`, { error: error.message });
      throw error;
    }
  }

  /**
   * Enqueue a request for rate limiting
   * @param {Function} requestFn - Function to make the request
   * @returns {Promise<Object>} - Response data
   */
  enqueueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;

    const { requestFn, resolve, reject } = this.requestQueue.shift();

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    // Schedule next request
    setTimeout(() => {
      this.processQueue();
    }, this.requestDelay);
  }

  /**
   * Get clan information
   * @param {String} clanTag - Clan tag
   * @returns {Promise<Object>} - Clan data
   */
  async getClan(clanTag) {
    const encodedTag = encodeURIComponent(clanTag);
    const cacheKey = `clan_${clanTag}`;

    return this.getOrFetch(cacheKey, async () => {
      try {
        log.info(`Fetching clan data for ${clanTag}`);
        const response = await this.getAxiosInstance().get(`/clans/${encodedTag}`);
        return response.data;
      } catch (error) {
        if (error.response?.status === 404) {
          log.warn(`Clan not found: ${clanTag}`);
          return null;
        }

        this.handleRequestError(error, `getClan(${clanTag})`);
      }
    });
  }

  /**
   * Get player information
   * @param {String} playerTag - Player tag
   * @returns {Promise<Object>} - Player data
   */
  async getPlayer(playerTag) {
    const encodedTag = encodeURIComponent(playerTag);
    const cacheKey = `player_${playerTag}`;

    return this.getOrFetch(cacheKey, async () => {
      try {
        log.info(`Fetching player data for ${playerTag}`);
        const response = await this.getAxiosInstance().get(`/players/${encodedTag}`);
        return response.data;
      } catch (error) {
        if (error.response?.status === 404) {
          log.warn(`Player not found: ${playerTag}`);
          return null;
        }

        this.handleRequestError(error, `getPlayer(${playerTag})`);
      }
    });
  }

  /**
   * Get current war information
   * @param {String} clanTag - Clan tag
   * @returns {Promise<Object>} - War data
   */
  async getCurrentWar(clanTag) {
    const encodedTag = encodeURIComponent(clanTag);
    const cacheKey = `currentWar_${clanTag}`;

    // Use a shorter TTL for current war
    const shortTTL = 5 * 60 * 1000; // 5 minutes

    // Check cache with shorter TTL
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);

      if (cached.expiry > Date.now()) {
        log.debug(`Using cached data for ${cacheKey}`);
        return cached.data;
      }

      // Cache expired, remove it
      this.cache.delete(cacheKey);
    }

    try {
      log.info(`Fetching current war data for ${clanTag}`);
      const response = await this.enqueueRequest(async () => {
        return this.getAxiosInstance().get(`/clans/${encodedTag}/currentwar`);
      });

      // Cache the result with shorter TTL
      this.cache.set(cacheKey, {
        data: response.data,
        expiry: Date.now() + shortTTL
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 403) {
        log.warn(`War data not available for ${clanTag}`);
        return null;
      }

      this.handleRequestError(error, `getCurrentWar(${clanTag})`);
      return null;
    }
  }

  /**
   * Get clan war league group
   * @param {String} clanTag - Clan tag
   * @returns {Promise<Object>} - CWL group data
   */
  async getCWLGroup(clanTag) {
    const encodedTag = encodeURIComponent(clanTag);
    const cacheKey = `cwlGroup_${clanTag}`;

    return this.getOrFetch(cacheKey, async () => {
      try {
        log.info(`Fetching CWL group data for ${clanTag}`);
        const response = await this.getAxiosInstance().get(`/clans/${encodedTag}/currentwar/leaguegroup`);
        return response.data;
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 403) {
          log.warn(`CWL group not available for ${clanTag}`);
          return null;
        }

        this.handleRequestError(error, `getCWLGroup(${clanTag})`);
        return null;
      }
    });
  }

  /**
   * Get clan war league war
   * @param {String} warTag - War tag
   * @returns {Promise<Object>} - CWL war data
   */
  async getCWLWar(warTag) {
    const encodedTag = encodeURIComponent(warTag);
    const cacheKey = `cwlWar_${warTag}`;

    return this.getOrFetch(cacheKey, async () => {
      try {
        log.info(`Fetching CWL war data for ${warTag}`);
        const response = await this.getAxiosInstance().get(`/clanwarleagues/wars/${encodedTag}`);
        return response.data;
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 403) {
          log.warn(`CWL war not available for ${warTag}`);
          return null;
        }

        this.handleRequestError(error, `getCWLWar(${warTag})`);
        return null;
      }
    });
  }

  /**
   * Test API and proxy connection
   * @returns {Promise<boolean>} - Whether connection is successful
   */
  async testConnection() {
    try {
      log.info('Testing API connection...');
      await this.getAxiosInstance().get('/locations');
      log.info('API connection test successful');
      return true;
    } catch (error) {
      this.handleRequestError(error, 'testConnection()');
      return false;
    }
  }

  /**
   * Get clan members
   * @param {String} clanTag - Clan tag
   * @returns {Promise<Array>} - Clan members
   */
  async getClanMembers(clanTag) {
    const clan = await this.getClan(clanTag);
    return clan ? clan.memberList : [];
  }
}

module.exports = new ClashApiService();