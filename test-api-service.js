// Create a test file: test-api-service.js
require('dotenv').config();
const clashApiService = require('./src/services/clashApiService');

async function testApiService() {
    console.log("Testing Clash of Clans API service...");

    try {
        // Test connection
        console.log("Testing API connection...");
        const connectionTest = await clashApiService.testProxyConnection();
        console.log("Connection test:", connectionTest.success ? "✅ Success" : "❌ Failed");

        if (!connectionTest.success) {
            console.error("Connection error:", connectionTest.message);
            process.exit(1);
        }

        // Test key rotation
        console.log("Testing API key rotation...");
        console.log("Current key index:", clashApiService.currentKeyIndex);
        clashApiService.rotateApiKey();
        console.log("After rotation index:", clashApiService.currentKeyIndex);

        // Test retrieving a clan
        console.log("Testing clan lookup...");
        const clanTag = "#2PP"; // Replace with a valid clan tag
        const clanData = await clashApiService.getClan(clanTag);
        console.log("✅ Clan lookup successful!");
        console.log("Clan name:", clanData.name);

        // Test cache
        console.log("Testing cache (second lookup should be faster)...");
        console.time("First lookup");
        await clashApiService.getClan(clanTag);
        console.timeEnd("First lookup");

        console.time("Second lookup (cached)");
        await clashApiService.getClan(clanTag);
        console.timeEnd("Second lookup (cached)");

        // Show API stats
        console.log("API stats:", clashApiService.getStatus());

    } catch (error) {
        console.error("Test failed:", error.message);
    }

    process.exit(0);
}

testApiService();