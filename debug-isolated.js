// debug-isolated.js
require('dotenv').config();
const { system: log } = require('./src/utils/logger');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// Memory logging
function logMemory() {
    const used = process.memoryUsage();
    console.log(`Memory: RSS ${Math.round(used.rss / 1024 / 1024)}MB, Heap ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

// Set error handlers
process.on('unhandledRejection', error => console.error('Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught Exception:', error));

(async () => {
    try {
        console.log("=== RAILWAY DEBUG TEST ===");
        logMemory();

        // Step 1: Test MongoDB connection
        console.log("\n📊 TESTING MONGODB CONNECTION");
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB connection successful!");

        // Step 2: Test Discord connection
        console.log("\n🤖 TESTING DISCORD CONNECTION");
        const client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
        });

        await client.login(process.env.DISCORD_TOKEN);
        console.log(`✅ Discord login successful as ${client.user.tag}!`);

        // Step 3: Test file system access (common Railway issue)
        console.log("\n📁 TESTING FILE SYSTEM ACCESS");
        const logsDir = './logs';
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
            console.log("Created logs directory");
        } else {
            console.log("Logs directory exists");
        }

        fs.writeFileSync('./logs/test.log', 'Railway test log entry');
        console.log("✅ File system access working!");

        // Clean up connections
        await mongoose.disconnect();
        client.destroy();

        console.log("\n🎉 ALL TESTS PASSED!");
        console.log("Your bot should be able to run on Railway.");
        console.log("The issue might be with tracking services that run after initial connection.");
        logMemory();
    } catch (error) {
        console.error("❌ TEST FAILED:", error);
        logMemory();
        process.exit(1);
    }
})();