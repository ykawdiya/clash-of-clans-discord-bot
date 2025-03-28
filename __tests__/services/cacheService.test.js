const cacheService = require('../../src/services/cacheService');

describe('Cache Service', () => {
    beforeEach(() => {
        cacheService.flush();
    });

    test('stores and retrieves values correctly', () => {
        cacheService.set('test-key', 'test-value');
        const result = cacheService.get('test-key');
        expect(result).toBe('test-value');
    });

    test('returns null for missing keys', () => {
        const result = cacheService.get('non-existent-key');
        expect(result).toBeNull();
    });

    test('handles TTL expiration', async () => {
        cacheService.set('expire-key', 'temp-value', 1); // 1 second TTL

        // Value should be available immediately
        expect(cacheService.get('expire-key')).toBe('temp-value');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Value should be gone
        expect(cacheService.get('expire-key')).toBeNull();
    });

    test('tracks cache statistics', () => {
        const initialStats = cacheService.getStats();

        // Set a value and retrieve it twice
        cacheService.set('stats-key', 'value');
        cacheService.get('stats-key');
        cacheService.get('stats-key');

        // Try a key that doesn't exist
        cacheService.get('missing-key');

        const updatedStats = cacheService.getStats();

        // Check that stats were incremented correctly
        expect(updatedStats.sets).toBe(initialStats.sets + 1);
        expect(updatedStats.hits).toBe(initialStats.hits + 2);
        expect(updatedStats.misses).toBe(initialStats.misses + 1);
    });

    test('deletes keys correctly', () => {
        cacheService.set('delete-key', 'delete-me');
        expect(cacheService.get('delete-key')).toBe('delete-me');

        cacheService.delete('delete-key');
        expect(cacheService.get('delete-key')).toBeNull();
    });

    test('flushes all keys', () => {
        cacheService.set('key1', 'value1');
        cacheService.set('key2', 'value2');

        cacheService.flush();

        expect(cacheService.get('key1')).toBeNull();
        expect(cacheService.get('key2')).toBeNull();
    });
});