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

    // Webshare global configuration
    this.proxyAgent = null;
    
    // Setup proxy agent for global use if credentials exist
    if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
      try {
        // Import the package correctly
        const { HttpsProxyAgent } = require('https-proxy-agent');
        
        // Build proxy URL with authentication
        const proxyAuth = process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD
          ? `${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@`
          : '';
        const proxyUrl = `http://${proxyAuth}${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
        
        // Create the proxy agent instance
        this.proxyAgent = new HttpsProxyAgent(proxyUrl);
        
        log.info(`Webshare proxy configured: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
        
        // Also patch global axios to use this proxy for any direct requests
        const axios = require('axios');
        axios.defaults.httpsAgent = this.proxyAgent;
        log.info('Global axios defaults updated to use Webshare proxy');
      } catch (error) {
        log.error('Failed to initialize Webshare proxy agent:', { error: error.message });
        log.info('Will proceed with direct connection');
      }
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

    // Use the pre-configured proxy agent if it exists
    if (this.proxyAgent) {
      // Use the agent we created in the constructor
      config.proxy = false; // Disable default proxy
      config.httpsAgent = this.proxyAgent;
      
      // Add browser-like headers for Webshare
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      
      // For debugging when making actual requests
      const username = process.env.PROXY_USERNAME || 'no-user';
      log.debug(`Using Webshare proxy (${username}) for Clash API request`);
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
   * Get clan information with fallback options
   * @param {String} clanTag - Clan tag
   * @returns {Promise<Object>} - Clan data
   */
  async getClan(clanTag) {
    const encodedTag = encodeURIComponent(clanTag);
    const cacheKey = `clan_${clanTag}`;

    try {
      // First try from cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached.expiry > Date.now()) {
          log.debug(`Using cached data for ${cacheKey}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }
      
      // Try official API
      try {
        log.info(`Fetching clan data for ${clanTag} from official API`);
        const response = await this.getAxiosInstance().get(`/clans/${encodedTag}`);
        const data = response.data;
        
        // Cache the result
        this.cache.set(cacheKey, {
          data,
          expiry: Date.now() + this.cacheTTL
        });
        
        return data;
      } catch (officialApiError) {
        if (officialApiError.response?.status === 404) {
          log.warn(`Clan not found in official API: ${clanTag}`);
          return null;
        }
        
        // Log the error but don't fail - try fallback
        this.handleRequestError(officialApiError, `getClan(${clanTag}) - official API`);
        
        // Try web scraping fallback - simulate browser request to Clash of Clans website
        try {
          log.info(`Using browser simulation fallback for ${clanTag}`);
          
          // Create browser-like headers and cookie
          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.clashofclans.com/',
            'Origin': 'https://www.clashofclans.com'
          };
          
          // Use direct browser search simulation
          // First check if clan exists in API database
          const searchTag = clanTag.replace('#', '');
          const clanDirectUrl = `https://www.clashofstats.com/clans/${searchTag}/summary`;
          
          log.info(`Attempting to verify clan exists at ${clanDirectUrl}`);
          
          // Create clearly labeled placeholder data 
          const minimalData = {
            tag: clanTag,
            name: `${clanTag} (API Unavailable)`,
            clanLevel: 0,
            members: 0,
            warLeague: { name: "API Unavailable" },
            isPlaceholder: true, // Flag to indicate this is not real data
            description: "⚠️ Unable to fetch clan data from Clash of Clans API. Please verify the clan tag is correct or try again later."
          };
          
          // Cache the result
          this.cache.set(cacheKey, {
            data: minimalData,
            expiry: Date.now() + this.cacheTTL
          });
          
          log.info(`Created API unavailable placeholder for ${clanTag}`);
          return minimalData;
        } catch (fallbackError) {
          log.error(`All fallbacks failed for ${clanTag}:`, { error: fallbackError.message });
        }
        
        // As a last resort, return data that clearly indicates API issues
        log.warn(`All API approaches failed for ${clanTag}, returning placeholder with warning`);
        return {
          tag: clanTag,
          name: `${clanTag} (API Unavailable)`,
          clanLevel: 0,
          members: 0,
          warLeague: { name: "API Unavailable" },
          isPlaceholder: true, // Flag to indicate this is not real data
          description: "⚠️ Unable to fetch clan data from Clash of Clans API. Please verify the clan tag is correct or try again later."
        };
      }
    } catch (error) {
      log.error(`Unexpected error getting clan data for ${clanTag}:`, { error: error.message });
      // Return data that clearly indicates API issues
      return {
        tag: clanTag,
        name: `${clanTag} (API Unavailable)`,
        clanLevel: 0,
        members: 0,
        warLeague: { name: "API Unavailable" },
        isPlaceholder: true, // Flag to indicate this is not real data
        description: "⚠️ Unable to fetch clan data from Clash of Clans API. Please verify the clan tag is correct or try again later."
      };
    }
  }
  
  /**
   * Search for clans by name or other criteria
   * @param {String} name - Clan name to search for
   * @param {Object} options - Additional search options
   * @returns {Promise<Array>} - Array of clan data
   */
  async searchClans(name, options = {}) {
    try {
      const searchParams = new URLSearchParams();
      
      // Add name search parameter
      if (name) {
        searchParams.append('name', name);
      }
      
      // Add additional search parameters if provided
      if (options.warFrequency) {
        searchParams.append('warFrequency', options.warFrequency);
      }
      
      if (options.minMembers) {
        searchParams.append('minMembers', options.minMembers);
      }
      
      if (options.maxMembers) {
        searchParams.append('maxMembers', options.maxMembers);
      }
      
      if (options.minClanLevel) {
        searchParams.append('minClanLevel', options.minClanLevel);
      }
      
      if (options.minClanPoints) {
        searchParams.append('minClanPoints', options.minClanPoints);
      }
      
      if (options.limit) {
        searchParams.append('limit', Math.min(options.limit, 50)); // API max is 50
      } else {
        searchParams.append('limit', 10); // Default to 10 results
      }
      
      const queryString = searchParams.toString();
      const cacheKey = `clan_search_${queryString}`;
      
      // Check cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached.expiry > Date.now()) {
          log.debug(`Using cached data for ${cacheKey}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }
      
      // Make API request
      log.info(`Searching clans with criteria: ${queryString}`);
      const response = await this.getAxiosInstance().get(`/clans?${queryString}`);
      
      if (!response.data || !response.data.items) {
        return [];
      }
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: response.data.items,
        expiry: Date.now() + this.cacheTTL
      });
      
      return response.data.items;
    } catch (error) {
      this.handleRequestError(error, `searchClans(${name})`);
      log.error(`Failed to search clans by name: ${name}`, { error: error.message });
      return [];
    }
  }
  
  /**
   * Converts public API format to official API format
   * @param {Object} publicData - Data from public API
   * @returns {Object} - Formatted data matching official API
   */
  convertPublicApiFormat(publicData) {
    return {
      tag: publicData.tag || '',
      name: publicData.name || 'Unknown Clan',
      clanLevel: publicData.level || 1,
      members: publicData.memberCount || 0,
      warLeague: { name: publicData.warLeague || 'Unknown' },
      description: publicData.description || '',
      warWins: publicData.warWins || 0,
      warLosses: publicData.warLosses || 0,
      warTies: publicData.warTies || 0
    };
  }
  
  /**
   * Handle request errors with proper logging
   * @param {Error} error - Error object
   * @param {String} method - Method where error occurred
   */
  handleRequestError(error, method) {
    if (error.response) {
      // The request was made and the server responded with a status code outside of 2xx
      log.error(`API error in ${method}:`, {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      // The request was made but no response was received
      log.error(`API no response in ${method}:`, {
        request: error.request.toString().substring(0, 500)
      });
    } else {
      // Something happened in setting up the request
      log.error(`API request setup error in ${method}:`, { error: error.message });
    }
    
    if (error.config) {
      log.debug(`API request config for ${method}:`, {
        url: error.config.url,
        method: error.config.method,
        baseURL: error.config.baseURL
      });
    }
  }

  /**
   * Get player information with fallback options
   * @param {String} playerTag - Player tag
   * @returns {Promise<Object>} - Player data
   */
  async getPlayer(playerTag) {
    const encodedTag = encodeURIComponent(playerTag);
    const cacheKey = `player_${playerTag}`;

    try {
      // First try from cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached.expiry > Date.now()) {
          log.debug(`Using cached data for ${cacheKey}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }
      
      // Try official API
      try {
        log.info(`Fetching player data for ${playerTag} from official API`);
        const response = await this.getAxiosInstance().get(`/players/${encodedTag}`);
        const data = response.data;
        
        // Cache the result
        this.cache.set(cacheKey, {
          data,
          expiry: Date.now() + this.cacheTTL
        });
        
        return data;
      } catch (officialApiError) {
        if (officialApiError.response?.status === 404) {
          log.warn(`Player not found in official API: ${playerTag}`);
          return null;
        }
        
        // Log the error but don't fail - try fallback
        this.handleRequestError(officialApiError, `getPlayer(${playerTag}) - official API`);
        
        // Use clear placeholder data that indicates API issues
        try {
          log.info(`Using API unavailable placeholder for player ${playerTag}`);
          
          const playerData = {
            tag: playerTag,
            name: `${playerTag} (API Unavailable)`,
            townHallLevel: 0,
            trophies: 0,
            role: "unknown",
            clan: null,
            isPlaceholder: true, // Flag to indicate this is not real data
            expLevel: 0,
            attackWins: 0,
            defenseWins: 0,
            warStars: 0,
            note: "⚠️ Unable to fetch player data from Clash of Clans API"
          };
          
          // Cache the result with a shorter TTL to try again sooner
          this.cache.set(cacheKey, {
            data: playerData,
            expiry: Date.now() + (this.cacheTTL / 5) // Shorter cache time for error state
          });
          
          log.info(`Created API unavailable placeholder for ${playerTag}`);
          return playerData;
        } catch (fallbackError) {
          log.error(`Enhanced fallback also failed for player ${playerTag}:`, { error: fallbackError.message });
        }
        
        // As a last resort, return data that clearly indicates API issues
        log.warn(`All APIs failed, returning API unavailable placeholder for player ${playerTag}`);
        return {
          tag: playerTag,
          name: `${playerTag} (API Unavailable)`,
          townHallLevel: 0,
          trophies: 0,
          role: "unknown",
          clan: null,
          isPlaceholder: true,
          expLevel: 0,
          attackWins: 0,
          defenseWins: 0,
          warStars: 0,
          note: "⚠️ Unable to fetch player data from Clash of Clans API"
        };
      }
    } catch (error) {
      log.error(`Unexpected error getting player data for ${playerTag}:`, { error: error.message });
      // Return data that clearly indicates API issues
      return {
        tag: playerTag,
        name: `${playerTag} (API Unavailable)`,
        townHallLevel: 0,
        trophies: 0,
        role: "unknown",
        clan: null,
        isPlaceholder: true,
        expLevel: 0,
        attackWins: 0,
        defenseWins: 0,
        warStars: 0,
        note: "⚠️ Unable to fetch player data from Clash of Clans API"
      };
    }
  }
  
  /**
   * Converts public API player format to official API format
   * @param {Object} publicData - Data from public API
   * @returns {Object} - Formatted data matching official API
   */
  convertPublicPlayerFormat(publicData) {
    return {
      tag: publicData.tag || '',
      name: publicData.name || 'Unknown Player',
      townHallLevel: publicData.townHallLevel || 1,
      trophies: publicData.trophies || 0,
      role: publicData.role || 'member',
      clan: publicData.clan ? {
        tag: publicData.clan.tag || '',
        name: publicData.clan.name || 'Unknown Clan'
      } : null
    };
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
   * @returns {Promise<Object>} - Result object with status and details
   */
  async testConnection() {
    try {
      log.info('Testing API connection...');
      
      // Store results in a comprehensive object
      const results = {
        success: false,
        proxyEnabled: Boolean(process.env.PROXY_HOST && process.env.PROXY_PORT),
        proxyWorking: false,
        currentIp: null,
        apiConnection: false,
        apiAccess: {
          locations: false,
          clans: false,
          players: false,
          currentWar: false,
          publicWarlog: false,
          cwlGroup: false
        },
        errorDetails: null
      };
      
      // Check proxy configuration
      if (results.proxyEnabled) {
        log.info('Webshare proxy is configured');
        
        // Test proxy connection by getting IP
        try {
          // Create a proxy-enabled axios instance but direct it to an IP service
          const axiosInstance = this.getAxiosInstance();
          // Override the baseURL for this test
          const originalBaseURL = axiosInstance.defaults.baseURL;
          axiosInstance.defaults.baseURL = '';
          
          // Get IP from Webshare proxy
          const ipResponse = await axiosInstance.get('https://api.ipify.org?format=json');
          results.currentIp = ipResponse.data.ip;
          results.proxyWorking = true;
          
          log.info(`✅ Webshare proxy is working! Proxy IP: ${results.currentIp}`);
          log.info('This IP should be whitelisted in your Clash of Clans Developer account');
          
          // Restore original baseURL
          axiosInstance.defaults.baseURL = originalBaseURL;
        } catch (proxyError) {
          log.error('❌ Failed to connect through Webshare proxy:', { error: proxyError.message });
          results.errorDetails = `Proxy Error: ${proxyError.message}`;
          
          // Try direct connection to see our actual IP
          try {
            const directIpResponse = await axios.get('https://api.ipify.org?format=json');
            results.currentIp = directIpResponse.data.ip;
            log.warn(`Your direct IP (not using proxy): ${results.currentIp}`);
            log.warn('The proxy is NOT working correctly');
          } catch (directError) {
            log.error('Could not determine any IP address');
          }
        }
      } else {
        // No proxy configured, just show the direct IP
        try {
          const ipResponse = await axios.get('https://api.ipify.org?format=json');
          results.currentIp = ipResponse.data.ip;
          log.info(`Current public IP address: ${results.currentIp}`);
          log.info('⚠️ If API calls fail, whitelist this IP in your Clash of Clans Developer account');
        } catch (ipError) {
          log.warn('Could not determine public IP address:', { error: ipError.message });
        }
      }
      
      // Test core API endpoints
      try {
        // Test locations endpoint (should always work)
        await this.getAxiosInstance().get('/locations');
        results.apiConnection = true;
        results.apiAccess.locations = true;
        log.info('✅ Basic API connection SUCCESSFUL (locations endpoint)');
        
        // Test all other major endpoints with sample data
        // 1. Test clan lookup
        try {
          // Use a popular clan that should always exist
          await this.getAxiosInstance().get('/clans/%232PP');
          results.apiAccess.clans = true;
          log.info('✅ Clan API access SUCCESSFUL');
          
          // 2. Test player lookup
          try {
            // Use a sample player from the clan
            const clanResponse = await this.getAxiosInstance().get('/clans/%232PP/members');
            
            if (clanResponse.data?.items?.length > 0) {
              const samplePlayerTag = clanResponse.data.items[0].tag;
              await this.getAxiosInstance().get(`/players/${encodeURIComponent(samplePlayerTag)}`);
              results.apiAccess.players = true;
              log.info('✅ Player API access SUCCESSFUL');
            }
          } catch (playerError) {
            log.warn('⚠️ Player API access FAILED');
          }
          
          // 3. Test war access (requires public war log)
          try {
            const warResponse = await this.getAxiosInstance().get('/clans/%232PP/currentwar');
            
            if (warResponse.data && warResponse.data.state !== 'notInWar') {
              results.apiAccess.currentWar = true;
              log.info('✅ Current War API access SUCCESSFUL');
            } else {
              log.info('ℹ️ Clan is not in war - cannot test war API');
            }
          } catch (warError) {
            if (warError.response?.status === 403) {
              log.warn('⚠️ War log is private - restricted access');
            } else {
              log.warn('⚠️ Current War API access FAILED');
            }
          }
          
          // 4. Test war log access (requires public war log)
          try {
            const warlogResponse = await this.getAxiosInstance().get('/clans/%232PP/warlog');
            results.apiAccess.publicWarlog = true;
            log.info('✅ War Log API access SUCCESSFUL');
          } catch (warlogError) {
            if (warlogError.response?.status === 403) {
              log.warn('⚠️ War log is private - restricted access');
            } else {
              log.warn('⚠️ War Log API access FAILED');
            }
          }
          
          // 5. Test CWL access (only available during active CWL)
          try {
            const cwlResponse = await this.getAxiosInstance().get('/clans/%232PP/currentwar/leaguegroup');
            
            if (cwlResponse.data && cwlResponse.data.state) {
              results.apiAccess.cwlGroup = true;
              log.info('✅ CWL API access SUCCESSFUL');
            } else {
              log.info('ℹ️ No active CWL - cannot test CWL API');
            }
          } catch (cwlError) {
            if (cwlError.response?.status === 404) {
              log.info('ℹ️ No active CWL - cannot test CWL API');
            } else {
              log.warn('⚠️ CWL API access FAILED');
            }
          }
          
        } catch (clanError) {
          log.warn('⚠️ Clan API access FAILED');
        }
        
        // Overall success if we have basic connectivity
        results.success = results.apiConnection && results.apiAccess.clans;
        
      } catch (apiError) {
        log.error('❌ Clash of Clans API connection FAILED');
        this.handleRequestError(apiError, 'testConnection()');
        results.errorDetails = `API Error: ${apiError.message}`;
      }
      
      // Log detailed results
      log.info('API Test Results:', results);
      
      return results;
    } catch (error) {
      log.error('❌ Complete API test failure:', { error: error.message });
      return {
        success: false,
        errorDetails: error.message
      };
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