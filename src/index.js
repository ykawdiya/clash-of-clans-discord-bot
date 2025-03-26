require('dotenv').config();
if (!process.env.DISCORD_TOKEN) {
    console.error('FATAL: DISCORD_TOKEN is not set in environment variables.');
    process.exit(1);
}

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Import database service
const databaseService = require('./services/databaseService');

// Import handlers
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

console.log('Starting CoC Discord Bot - Version 1.0.1');
console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKeyConfigured: process.env.COC_API_KEY ? 'Yes' : 'No',
    port: process.env.PORT || 3000
});

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

// Setup Express server for health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Clash of Clans Discord Bot is running!');
});

const server = app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Load commands ONCE
console.log('Loading commands...');
const { commandFiles } = loadCommands();
commandFiles.forEach((command, name) => {
    client.commands.set(name, command);
});
console.log(`Loaded ${client.commands.size} commands into client collection`);

// Load all event handlers
console.log('Loading event handlers...');
loadEvents(client);

// When bot is ready, register commands ONCE
client.once('ready', async () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);

    // REGISTER COMMANDS ONCE AFTER BOT IS READY
    console.log('Registering slash commands with Discord API...');
    try {
        const { registerCommands } = require('./handlers/commandHandler');
        await registerCommands(client.user.id);
    } catch (error) {
        console.error('Error registering commands:', error);
    }

    console.log('Bot initialization complete!');
});

// Initialize the bot
async function init() {
    try {
        // Connect to database if URI is provided
        if (process.env.MONGODB_URI) {
            console.log('Connecting to database...');
            await databaseService.connect()
                .then(() => console.log('Database connected successfully'))
                .catch(err => console.error('Database connection error:', err));
        } else {
            console.warn('MONGODB_URI not set. Database features will not work.');
        }

        // Login to Discord
        console.log('Connecting to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');

    if (databaseService.isConnected) {
        await databaseService.disconnect();
    }

    server.close();
    client.destroy();
    process.exit(0);
});

// Start the bot
init();