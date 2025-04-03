// src/deploy-test.js
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('discord.js');

// Load environment variables
const clientId = process.env.CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID || ''; // 👈 Your guild ID here

if (!guildId) {
    console.error('❌ ERROR: No GUILD_ID provided in .env file!');
    process.exit(1);
}

async function deployTestCommands() {
    try {
        console.log('🚀 Deploying test commands...');

        // Create hardcoded test commands
        const commands = [
            new SlashCommandBuilder()
                .setName('test-ping')
                .setDescription('Test if the bot is working'),

            new SlashCommandBuilder()
                .setName('test-echo')
                .setDescription('Echo back your message')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The message to echo back')
                        .setRequired(true))
        ];

        // Convert to JSON
        const commandsJson = commands.map(command => command.toJSON());

        // Create REST client
        const rest = new REST({ version: '9' }).setToken(token);

        // Deploy commands
        console.log(`Deploying ${commandsJson.length} test commands to guild ${guildId}...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commandsJson }
        );

        console.log(`✅ Successfully deployed ${data.length} test commands!`);
        console.log('If commands appear in Discord, your bot is working correctly.');
        console.log('Next step: Fix your main command structure.');
    } catch (error) {
        console.error('Error deploying test commands:', error);
    }
}

deployTestCommands();