// src/services/cacheService.js
const NodeCache = require('node-cache');

class CacheService {
    constructor(ttlSeconds = 300) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2,
            useClones: false
        });
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value, ttl = null) {
        return this.cache.set(key, value, ttl);
    }

    delete(key) {
        return this.cache.del(key);
    }

    // Wrapper for functions to cache their results
    cacheFunction(fn, keyPrefix, ttl = null) {
        return async (...args) => {
            const key = `${keyPrefix}:${JSON.stringify(args)}`;
            const cachedResult = this.get(key);

            if (cachedResult) {
                console.log(`Cache hit for ${key}`);
                return cachedResult;
            }

            console.log(`Cache miss for ${key}, calling function`);
            const result = await fn(...args);
            this.set(key, result, ttl);
            return result;
        };
    }

    // Clear all cache
    flush() {
        return this.cache.flushAll();
    }

    // Clear cache by pattern
    flushPattern(pattern) {
        const keys = this.cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        return this.cache.del(matchingKeys);
    }
}

// Export a singleton instance
module.exports = new CacheService();