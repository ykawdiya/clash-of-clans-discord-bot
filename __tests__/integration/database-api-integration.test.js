// Create __tests__/integration/database-api-integration.test.js
const mongoose = require('mongoose');
const databaseService = require('../../src/services/databaseService');
const clashApiService = require('../../src/services/clashApiService');
const Clan = require('../../src/models/Clan');
require('dotenv').config();

// These tests require actual API and database connections
describe('Database and API Integration', () => {
    beforeAll(async () => {
        // Connect to test database
        await databaseService.connect();
    }, 10000); // Longer timeout for connection

    afterAll(async () => {
        // Clean up and disconnect
        await databaseService.disconnect();
    });

    test('Can fetch clan data and save to database', async () => {
        // Skip if no connection
        if (!databaseService.isConnected) {
            console.warn('Database not connected, skipping test');
            return;
        }

        // Fetch a known clan
        const clanTag = '#2PP'; // Replace with a known clan tag
        const clanData = await clashApiService.getClan(clanTag);

        // Create a test clan document
        const testClan = new Clan({
            clanTag: clanData.tag,
            name: clanData.name,
            guildId: 'test-guild-123',
            description: clanData.description || '',
            isPrimary: true,
            clanType: 'Test'
        });

        // Save to database
        await testClan.save();

        // Retrieve from database and verify
        const savedClan = await Clan.findOne({ clanTag: clanData.tag, guildId: 'test-guild-123' });

        expect(savedClan).not.toBeNull();
        expect(savedClan.name).toBe(clanData.name);
        expect(savedClan.isPrimary).toBe(true);

        // Clean up
        await Clan.deleteOne({ clanTag: clanData.tag, guildId: 'test-guild-123' });
    }, 15000); // Longer timeout for API and DB operations
});