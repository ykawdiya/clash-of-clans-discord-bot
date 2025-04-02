// railway-debug.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

// Memory tracking
function logMemory(label) {
    const mem = process.memoryUsage();
    console.log(`${label} - Memory: RSS: ${Math.round(mem.rss/1024/1024)}MB, Heap: ${Math.round(mem.heapUsed/1024/1024)}MB`);
}

// Handle errors
process.on('unhandledRejection', error => {
    console.error('UNHANDLED REJECTION:', error);
    logMemory('At error');
});

process.on('uncaughtException', error => {
    console.error('UNCAUGHT EXCEPTION:', error);
    logMemory('At error');
});

async function runBot() {
    console.log("=== RAILWAY DEBUG MODE ===");
    logMemory('Startup');

    try {
        // Step 1: MongoDB
        console.log("\nStep 1: Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB connected");
        logMemory('After MongoDB');

        // Step 2: Create Discord client
        console.log("\nStep 2: Creating Discord client...");
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers
            ]
        });
        client.commands = new Collection();
        global.client = client; // Make accessible globally
        console.log("✅ Discord client created");
        logMemory('After client creation');

        // Step 3: Load commands gradually
        console.log("\nStep 3: Loading commands...");
        const commandsLoaded = await loadCommands(client);
        console.log(`✅ Loaded ${commandsLoaded} commands`);
        logMemory('After commands');

        // Step 4: Load events
        console.log("\nStep 4: Loading events...");
        const eventsLoaded = await loadEvents(client);
        console.log(`✅ Loaded ${eventsLoaded} events`);
        logMemory('After events');

        // Step 5: Login to Discord
        console.log("\nStep 5: Logging into Discord...");
        await client.login(process.env.DISCORD_TOKEN);
        console.log(`✅ Discord login successful as ${client.user.tag}`);
        logMemory('After login');

        // Step 6: Initialize tracking services one by one
        console.log("\nStep 6: Starting tracking services...");

        // War tracking
        console.log("  Starting war tracking...");
        const warTrackingService = require('./src/services/warTrackingService');
        await warTrackingService.startWarMonitoring();
        console.log("  ✅ War tracking started");
        logMemory('After war tracking');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // CWL tracking
        console.log("  Starting CWL tracking...");
        const cwlTrackingService = require('./src/services/cwlTrackingService');
        await cwlTrackingService.startCWLMonitoring();
        console.log("  ✅ CWL tracking started");
        logMemory('After CWL tracking');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Capital tracking
        console.log("  Starting Capital tracking...");
        const capitalTrackingService = require('./src/services/capitalTrackingService');
        await capitalTrackingService.startCapitalMonitoring();
        console.log("  ✅ Capital tracking started");
        logMemory('After Capital tracking');

        console.log("\n🎉 BOT SUCCESSFULLY STARTED!");
        logMemory('Final');
    } catch (error) {
        console.error("❌ ERROR:", error);
        logMemory('At error');
    }
}

async function loadCommands(client) {
    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFiles = getFiles(commandsPath).filter(file => file.endsWith('.js'));
    let count = 0;

    for (const file of commandFiles) {
        try {
            const command = require(file);
            const commandName = command.data?.name || path.basename(file, '.js');
            client.commands.set(commandName, command);
            count++;

            // Log progress and add a small delay every 5 commands
            if (count % 5 === 0) {
                console.log(`  Loaded ${count}/${commandFiles.length} commands...`);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (error) {
            console.error(`  Error loading command ${file}:`, error.message);
        }
    }

    return count;
}

async function loadEvents(client) {
    const eventsPath = path.join(__dirname, 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    let count = 0;

    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            const eventName = path.basename(file, '.js');

            if (event.once) {
                client.once(eventName, (...args) => event.execute(...args));
            } else {
                client.on(eventName, (...args) => event.execute(...args));
            }

            count++;
        } catch (error) {
            console.error(`  Error loading event ${file}:`, error.message);
        }
    }

    return count;
}

function getFiles(dir) {
    const files = [];

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
        const itemPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            files.push(...getFiles(itemPath));
        } else {
            files.push(itemPath);
        }
    }

    return files;
}

// Run the bot
runBot();