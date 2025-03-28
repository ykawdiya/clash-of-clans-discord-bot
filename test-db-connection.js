// Create a test file: test-db-connection.js
require('dotenv').config();
const databaseService = require('./src/services/databaseService');
const { db: log } = require('./src/utils/logger');

async function testConnection() {
    console.log("Testing database connection...");

    // Set up event listeners
    databaseService.on('connected', () => {
        console.log("✅ Connection successful!");
    });

    databaseService.on('error', (error) => {
        console.error("❌ Connection failed:", error.message);
    });

    try {
        await databaseService.connect();

        // Check if connection is active
        const status = databaseService.getStatus();
        console.log("Connection status:", status);

        // Try a simple ping
        if (databaseService.isConnected) {
            console.log("Testing ping...");
            await databaseService.connection.db.admin().ping();
            console.log("✅ Ping successful!");
        }

        // Close connection
        await databaseService.disconnect();
        console.log("Connection closed");

    } catch (error) {
        console.error("Test failed:", error.message);
    }

    process.exit(0);
}

testConnection();