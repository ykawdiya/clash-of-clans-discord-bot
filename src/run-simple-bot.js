// src/run-simple-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const path = require('path');
const fs = require('fs');

// Create the debug command manually
const debugCommand = require('./commands/debug.js');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Set up commands collection
client.commands = new Collection();
client.commands.set('debug', debugCommand);

// Simple heartbeat to verify bot is still running
setInterval(() => {
    console.log(`Bot heartbeat: ${new Date().toISOString()}`);
}, 60000);

// Handle command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    console.log(`Received command: ${interaction.commandName} from ${interaction.user.tag}`);

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.log(`Command not found: ${interaction.commandName}`);
        return;
    }

    try {
        console.log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error response:', replyError);
        }
    }
});

// Handle ready event
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);

    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (${guild.id})`);
    });

    console.log('Ready and listening for commands!');
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Register the debug command
async function registerCommands() {
    try {
        const clientId = process.env.CLIENT_ID;
        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;

        if (!guildId) {
            console.error('No GUILD_ID provided in .env file!');
            return;
        }

        const rest = new REST({ version: '9' }).setToken(token);

        console.log(`Registering debug command to guild ${guildId}...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [debugCommand.data.toJSON()] }
        );

        console.log(`Successfully registered ${data.length} commands!`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Start the bot
async function startBot() {
    try {
        console.log('Starting simple bot...');

        // Register commands first
        await registerCommands();

        // Then login to Discord
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('Error starting bot:', error);
        process.exit(1);
    }
}

startBot();