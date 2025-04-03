// src/diagnostic-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Configuration
const clientId = process.env.CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

// Create bot client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Create REST API client
const rest = new REST({ version: '9' }).setToken(token);

// Generate a unique command name using timestamp to avoid conflicts
const uniqueCommandName = `diag${Date.now()}`;
console.log(`Using unique command name: ${uniqueCommandName}`);

// When bot is ready
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
        // Register a unique command
        console.log(`Registering command ${uniqueCommandName}...`);

        // First delete all existing guild commands to start fresh
        console.log('Removing all existing guild commands...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [] }
        );
        console.log('All guild commands removed');

        // Register new unique command
        const commandData = [{
            name: uniqueCommandName,
            description: 'Diagnostic test command',
            type: 1
        }];

        const registeredCommands = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commandData }
        );

        console.log(`Registered ${registeredCommands.length} command(s)`);
        console.log(`Please use /${uniqueCommandName} in Discord to test the bot`);
    } catch (error) {
        console.error('Error registering command:', error);
    }
});

// Handle interactions with very defensive error handling
client.on(Events.InteractionCreate, async interaction => {
    console.log('Received interaction:', {
        id: interaction.id,
        type: interaction.type,
        commandName: interaction.commandName,
        acknowledged: interaction.replied || interaction.deferred
    });

    if (!interaction.isChatInputCommand()) {
        console.log('Not a chat input command, ignoring');
        return;
    }

    console.log(`Command: ${interaction.commandName}`);

    if (interaction.commandName !== uniqueCommandName) {
        console.log(`Ignoring command ${interaction.commandName} (not our test command)`);
        return;
    }

    console.log('Processing our diagnostic command');

    // Check if already replied
    if (interaction.replied) {
        console.log('WARNING: Interaction already replied to!');
        return;
    }

    if (interaction.deferred) {
        console.log('WARNING: Interaction already deferred!');
        return;
    }

    try {
        console.log('Attempting to reply to interaction...');
        await interaction.reply({
            content: `✅ Diagnostic test successful at ${new Date().toISOString()}`
        });
        console.log('Reply sent successfully!');
    } catch (error) {
        console.error('Error replying to interaction:', error);

        // If we failed to reply, try followUp
        try {
            console.log('Attempting to use followUp instead...');
            await interaction.followUp({
                content: `Alternative response method at ${new Date().toISOString()}`
            });
            console.log('followUp sent successfully!');
        } catch (followUpError) {
            console.error('Error with followUp:', followUpError);
        }
    }
});

// Add error handling for the Discord client
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Log in to Discord
console.log('Starting bot and connecting to Discord...');
client.login(token).catch(error => {
    console.error('Failed to log in to Discord:', error);
});