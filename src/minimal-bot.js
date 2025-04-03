// src/minimal-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Create basic test command
const testCommand = {
    data: {
        name: 'test',
        description: 'Simple test command'
    },
    execute: async (interaction) => {
        try {
            await interaction.reply('✅ Test successful! Bot is working!');
        } catch (error) {
            console.error('Error replying to interaction:', error);
        }
    }
};

// Create Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Set up commands collection
client.commands = new Collection();
client.commands.set(testCommand.data.name, testCommand);

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
    }
});

// Handle ready event
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);

    // Register command after login
    try {
        const clientId = process.env.CLIENT_ID;
        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;

        if (!guildId) {
            console.error('No GUILD_ID provided in .env file!');
            return;
        }

        const rest = new REST({ version: '9' }).setToken(token);
        console.log(`Registering test command to guild ${guildId}...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [{
                    name: testCommand.data.name,
                    description: testCommand.data.description,
                    type: 1
                }] }
        );

        console.log(`Successfully registered ${data.length} commands!`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Logging in to Discord...'))
    .catch(error => {
        console.error('Failed to login to Discord:', error);
        process.exit(1);
    });