// __tests__/integration/database-api-integration.test.js

const mongoose = require('mongoose');
const databaseService = require('../../src/services/databaseService');
const Clan = require('../../src/models/Clan');
require('dotenv').config();

// Import the mock API service instead of the real one
jest.mock('../../src/services/clashApiService', () =>
    require('../mocks/clashApiService.mock')
);
const clashApiService = require('../../src/services/clashApiService');

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

        // Fetch a known clan - this will use the mock now
        const clanTag = '#2PP';
        const clanData = await clashApiService.getClan(clanTag);

        // Create a test clan document with a valid clanType
        // Use 'Other' which is an allowed enum value
        const testClan = new Clan({
            clanTag: clanData.tag,
            name: clanData.name,
            guildId: 'test-guild-123',
            description: clanData.description || '',
            isPrimary: true,
            clanType: 'Other' // Changed from 'Test' to 'Other'
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