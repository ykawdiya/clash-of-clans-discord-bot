// src/message-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

// Create the simplest possible client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Need this for message content
    ]
});

// Ready event
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is listening for messages starting with "!test"`);
});

// Message event
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Simple prefix command
    if (message.content.startsWith('!test')) {
        console.log(`Received test command from ${message.author.tag}`);

        try {
            await message.reply(`✓ Bot is working! Response time: ${client.ws.ping}ms`);
            console.log('Successfully replied to message');
        } catch (error) {
            console.error('Error replying to message:', error);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Login
console.log('Starting message-based bot...');
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Login successful'))
    .catch(error => console.error('Login failed:', error));