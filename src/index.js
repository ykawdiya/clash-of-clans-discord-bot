require('dotenv').config();
if (!process.env.DISCORD_TOKEN) {
    console.error('FATAL: DISCORD_TOKEN is not set in environment variables.');
    process.exit(1);
}

// Import required packages
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Import database service first to avoid reference error
const databaseService = require('./services/databaseService');

console.log('Starting CoC Discord Bot - Version 1.0.1');
console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKeyConfigured: process.env.COC_API_KEY ? 'Yes' : 'No',
    port: process.env.PORT || 3000
});

// Create Discord client with necessary intents
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

// Start Express server for health checks
const server = app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Load all commands from the src/commands directory
function loadCommands() {
    const commands = [];
    const commandFiles = new Map();

    try {
        const commandsPath = path.join(__dirname, 'commands');
        console.log(`Looking for commands in: ${commandsPath}`);

        const folders = fs.readdirSync(commandsPath);

        for (const folder of folders) {
            const folderPath = path.join(commandsPath, folder);

            if (!fs.statSync(folderPath).isDirectory()) continue;

            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found ${files.length} command files in ${folder}`);

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                try {
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath);

                    if ('data' in command && 'execute' in command) {
                        commandFiles.set(command.data.name, command);
                        commands.push(command.data.toJSON());
                        console.log(`Loaded command: ${command.data.name}`);
                    }
                } catch (error) {
                    console.error(`Error loading command from ${filePath}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error loading commands:', error);
    }

    return { commands, commandFiles };
}

// Register slash commands with Discord
async function registerCommands(clientId) {
    const { commands } = loadCommands();

    if (commands.length === 0) {
        console.error('No commands to register');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`Registering ${commands.length} slash commands...`);

        // First, clear any existing commands
        console.log('Clearing existing global commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );

        // Then register the commands
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log(`Successfully registered ${data.length} global commands`);

        // Register guild commands for faster testing in development
        if (process.env.NODE_ENV === 'development' && process.env.GUILD_ID) {
            const guildId = process.env.GUILD_ID;
            console.log(`Registering commands to test guild ${guildId}`);

            const guildData = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );

            console.log(`Successfully registered ${guildData.length} commands to test guild`);
        }

        return data;
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Handle interactions (commands)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'There was an error executing this command!',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: 'There was an error executing this command!',
                ephemeral: true
            });
        }
    }
});

// When bot is ready
client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);

    // Set activity
    client.user.setActivity('Clash of Clans', { type: ActivityType.Playing });

    // Register commands
    await registerCommands(client.user.id);

    // Load commands into client.commands collection
    const { commandFiles } = loadCommands();
    client.commands = commandFiles;

    console.log(`Bot is serving ${client.guilds.cache.size} servers`);
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

// Health check and test endpoints
app.get('/ip', async (req, res) => {
    // Implementation unchanged
});

app.get('/proxy-test', async (req, res) => {
    // Implementation unchanged
});

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