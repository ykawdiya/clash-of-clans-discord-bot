// Import required packages
const { Client, GatewayIntentBits, Events } = require('discord.js');
const express = require('express');
require('dotenv').config();

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Setup Express server for health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Clash of Clans Discord Bot is running!');
});

// Discord bot event handlers
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Simple ping command for testing
    if (message.content === '!ping') {
        await message.reply('Pong!');
    }
});

// Start Express server for health checks
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Error connecting to Discord:', error);
});