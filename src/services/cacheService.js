// src/services/cacheService.js
const NodeCache = require('node-cache');
const { services: log } = require('../utils/logger');

class CacheService {
    constructor(ttlSeconds = 300) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2,
            useClones: false
        });

        // Stats tracking
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            flushes: 0
        };
    }

    get(key) {
        const value = this.cache.get(key);
        if (value === undefined) {
            this.stats.misses++;
            return null;
        }
        this.stats.hits++;
        return value;
    }

    set(key, value, ttl = null) {
        this.stats.sets++;
        return this.cache.set(key, value, ttl);
    }

    delete(key) {
        this.stats.deletes++;
        return this.cache.del(key);
    }

    // Wrapper for functions to cache their results
    cacheFunction(fn, keyPrefix, ttl = null) {
        return async (...args) => {
            const key = `${keyPrefix}:${JSON.stringify(args)}`;
            const cachedResult = this.get(key);

            if (cachedResult) {
                log.debug(`Cache hit for ${key}`);
                return cachedResult;
            }

            log.debug(`Cache miss for ${key}, calling function`);
            const result = await fn(...args);
            this.set(key, result, ttl);
            return result;
        };
    }

    // Clear all cache
    flush() {
        this.stats.flushes++;
        return this.cache.flushAll();
    }

    // Clear cache by pattern
    flushPattern(pattern) {
        const keys = this.cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        this.stats.deletes += matchingKeys.length;
        return this.cache.del(matchingKeys);
    }

    // Get cache stats
    getStats() {
        const keys = this.cache.keys();
        const hitRatio = (this.stats.hits + this.stats.misses) > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) + '%'
            : 'N/A';

        return {
            ...this.stats,
            hitRatio,
            keyCount: keys.length,
            memoryUsage: this.cache.getStats().vsize
        };
    }
}

// Export a singleton instance
module.exports = new CacheService();