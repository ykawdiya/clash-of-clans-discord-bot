require('dotenv').config();
require('./src/utils/commandModelFix');

// Import logger
const { system: log, discord: discordLog } = require('./src/utils/logger');

// Comprehensive check for required environment variables
const requiredEnvVars = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'COC_API_KEY',
    'MONGODB_URI'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('ERROR: Missing required environment variables:', missingVars.join(', '));
    console.error('Please check your .env file and make sure all required variables are set.');
    process.exit(1);
}

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Import database service
const databaseService = require('./src/services/databaseService');

// Import handlers
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');

// Import enhanced automation service
const AutomationService = require('./src/services/automationService');

console.log('Starting CoC Discord Bot - Version 1.1.0');
console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKeyConfigured: process.env.COC_API_KEY ? 'Yes' : 'No',
    port: process.env.PORT || 3000
});

// Check proxy configuration
const proxyConfigured = process.env.PROXY_HOST &&
    process.env.PROXY_PORT &&
    process.env.PROXY_USERNAME &&
    process.env.PROXY_PASSWORD;

console.log(`Proxy configuration: ${proxyConfigured ? 'Complete' : 'Incomplete'}`);
if (!proxyConfigured) {
    console.warn('WARNING: Proxy is not fully configured. This may cause issues with the Clash of Clans API.');
    console.warn('Consider setting PROXY_HOST, PROXY_PORT, PROXY_USERNAME, and PROXY_PASSWORD');
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Create command collection on client
client.commands = new Collection();
// Initially assume database is not available until verified
client.databaseAvailable = false;

// Make client globally accessible for other modules
global.client = client;

// Export client for use in other modules
module.exports.client = client;

// Initialize the enhanced automation service
const automationService = new AutomationService(client);

// Setup Express server for health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Clash of Clans Discord Bot is running!');
});

// Setup data directory for persistent storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory for persistent storage');
}

const server = app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Load all event handlers
console.log('Loading event handlers...');
loadEvents(client);

// When bot is ready, register commands ONCE
client.once('ready', async () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);

    // Load commands and register them with the client
    console.log('Loading commands...');
    const { commandFiles } = loadCommands();
    commandFiles.forEach((command, name) => {
        client.commands.set(name, command);
    });
    console.log(`Loaded ${client.commands.size} commands into client collection`);

    // Start automation services including automatic stats tracking
    try {
        automationService.startAutomation();
        console.log('Automated services started successfully, including stats tracking');
    } catch (error) {
        console.error('Failed to start automated services:', error);
    }

    // Register commands with Discord API
    console.log('Registering slash commands with Discord API...');
    try {
        const { registerCommands } = require('./src/handlers/commandHandler');
        // Use guild commands in development for faster updates
        const isDev = process.env.NODE_ENV === 'development';
        if (isDev && process.env.GUILD_ID) {
            console.log(`Development mode: Registering commands to guild ${process.env.GUILD_ID}`);
            await registerCommands(client.user.id, process.env.GUILD_ID);
        } else {
            console.log('Production mode: Registering global commands');
            await registerCommands(client.user.id);
        }
    } catch (error) {
        console.error('Error registering commands:', error);
        console.error('Stack trace:', error.stack);
    }

    console.log('Bot initialization complete!');
});

// Initialize the bot
async function init() {
    try {
        // Connect to database if URI is provided
        if (process.env.MONGODB_URI) {
            console.log('Connecting to database...');
            try {
                // Try to connect with timeout to prevent hanging
                const dbConnectPromise = databaseService.connect();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Database connection timed out after 30 seconds')), 30000)
                );

                await Promise.race([dbConnectPromise, timeoutPromise]);

                // Verify the connection is working
                if (!databaseService.checkConnection()) {
                    throw new Error('Database connection state check failed');
                }

                console.log('Database connected and verified successfully');
                // Flag database as available
                client.databaseAvailable = true;
            } catch (err) {
                console.error('Database connection error:', err);
                console.error('Stack trace:', err.stack);
                console.warn('Continuing without database. Some features will not work.');
                // Ensure flag is set to false
                client.databaseAvailable = false;
            }
        } else {
            console.warn('MONGODB_URI not set. Database features will not work.');
            client.databaseAvailable = false;
        }

        // Login to Discord with timeout
        console.log('Connecting to Discord...');
        const loginPromise = client.login(process.env.DISCORD_TOKEN);

        // Add timeout to catch hanging login attempts
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Discord login timed out after 30 seconds')), 30000);
        });

        await Promise.race([loginPromise, timeoutPromise]);
    } catch (error) {
        console.error('Error initializing bot:', error);
        console.error('Stack trace:', error.stack);

        if (error.message.includes('token')) {
            console.error('ERROR: Invalid Discord token. Please check your DISCORD_TOKEN value.');
        } else if (error.message.includes('timed out')) {
            console.error('ERROR: Discord connection timed out. Please check your internet connection.');
        }

        process.exit(1);
    }
}

// Error handling
process.on('unhandledRejection', (error, promise) => {
    console.error('Unhandled promise rejection:', error);
    console.error('Promise:', promise);
    console.error('Stack trace:', error.stack);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    console.error('Stack trace:', error.stack);

    // For critical errors, exit the process after logging
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('Critical connection error. Exiting process...');
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');

    // Stop automation service
    if (automationService) {
        automationService.stopAutomation();
    }

    if (databaseService.isConnected) {
        await databaseService.disconnect();
    }

    server.close();
    client.destroy();
    process.exit(0);
});

// Start the bot
init();