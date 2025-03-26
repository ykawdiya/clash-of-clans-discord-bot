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

// Add this after your initial require statements
console.log('Starting CoC Discord Bot - Version 1.0.1');
console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKeyConfigured: process.env.COC_API_KEY ? 'Yes' : 'No',
    port: process.env.PORT || 3000
});

// Import handlers
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

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

process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.close(() => {
        console.log('Express server closed.');
        process.exit(0);
    });
});

// Create necessary directories if they don't exist
const createDirectories = () => {
    const dirs = [
        './src/commands',
        './src/commands/info',
        './src/commands/utility',
        './src/commands/admin',
        './src/events',
        './src/handlers',
        './src/services',
        './src/models'
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
};

// Add a simple ping command for testing
const createTestCommand = () => {
    const pingCommandPath = path.join(__dirname, 'src/commands/utility/ping.js'); // Fixed path

    if (!fs.existsSync(pingCommandPath)) {
        const pingCommandContent = `const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(\`Pong! Latency: \${latency}ms | API Latency: \${Math.round(interaction.client.ws.ping)}ms\`);
    },
};`;

        // Ensure directory exists
        const dir = path.dirname(pingCommandPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(pingCommandPath, pingCommandContent);
        console.log('Created test ping command');
    }
};

// Create modified ready event file that doesn't register commands
const createReadyEvent = () => {
    const readyEventPath = path.join(__dirname, 'src/events/ready.js'); // Fixed path

    // IMPORTANT: Modified to NOT register commands
    const readyEventContent = `const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            console.log(\`Ready! Logged in as \${client.user.tag}\`);
            
            // Set bot activity
            client.user.setActivity('Clash of Clans', { type: 0 }); // 0 is Playing
            
            console.log(\`Bot is now ready and serving \${client.guilds.cache.size} servers\`);
        } catch (error) {
            console.error('Error in ready event:', error);
        }
    },
};`;

    // Ensure directory exists
    const dir = path.dirname(readyEventPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(readyEventPath, readyEventContent);
    console.log('Created modified ready event file that does not register commands');
};

// Create interactionCreate event file if it doesn't exist
const createInteractionEvent = () => {
    const interactionEventPath = path.join(__dirname, 'src/events/interactionCreate.js'); // Fixed path

    if (!fs.existsSync(interactionEventPath)) {
        const interactionEventContent = `const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(\`No command matching \${interaction.commandName} was found.\`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(\`Error executing \${interaction.commandName}\`);
            console.error(error);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
    },
};`;

        // Ensure directory exists
        const dir = path.dirname(interactionEventPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(interactionEventPath, interactionEventContent);
        console.log('Created interaction event file');
    }
};

// New function to manually register commands with Discord API
async function manuallyRegisterCommands() {
    try {
        console.log('Attempting to manually register commands with Discord API...');

        // Load all commands
        const commands = [];
        const commandsPath = path.join(__dirname, 'src/commands'); // Fixed path

        if (!fs.existsSync(commandsPath)) {
            console.error('Commands directory not found!');
            return;
        }

        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    // Clear require cache
                    delete require.cache[require.resolve(filePath)];

                    const command = require(filePath);

                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                        console.log(`Added command to registration: ${command.data.name}`);
                    } else {
                        console.warn(`Command at ${filePath} is missing required properties`);
                    }
                } catch (error) {
                    console.error(`Error loading command from ${filePath}:`, error);
                }
            }
        }

        if (commands.length === 0) {
            console.error('No commands found to register!');
            return;
        }

        // Create REST instance
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log(`Attempting to register ${commands.length} application commands...`);

        // First, clear any existing commands
        console.log("Clearing existing global commands...");
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [] }
        );
        console.log("Existing commands cleared");

        // Register globally (this takes up to an hour to propagate)
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log(`Successfully registered ${data.length} application commands globally`);

        // For faster testing with a guild
        if (process.env.GUILD_ID) {
            const testGuildId = process.env.GUILD_ID;
            console.log(`Registering commands to test guild ${testGuildId} for faster updates...`);
            const guildData = await rest.put(
                Routes.applicationGuildCommands(client.user.id, testGuildId),
                { body: commands }
            );
            console.log(`Successfully registered ${guildData.length} commands to test guild`);
        }
    } catch (error) {
        console.error('Error registering commands manually:', error);
        if (error.rawError) {
            console.error('Raw Discord API error:', JSON.stringify(error.rawError, null, 2));
        }
    }
}

const init = async () => {
    try {
        console.log('Starting bot initialization...');

        // Initialize database connection
        if (process.env.MONGODB_URI) {
            console.log('Connecting to database...');
            await databaseService.connect()
                .then(() => console.log('Database connected successfully'))
                .catch(err => console.error('Database connection error:', err));
        } else {
            console.warn('MONGODB_URI not set. Database features will not work.');
        }

        // Create necessary infrastructure
        createDirectories();
        createTestCommand();
        createReadyEvent(); // Now creates a version that doesn't register commands
        createInteractionEvent();

        // Load commands (only doing this once)
        const { commandFiles } = loadCommands();
        commandFiles.forEach((command, name) => {
            client.commands.set(name, command);
        });
        console.log(`Loaded ${client.commands.size} commands to client collection`);

        // Debug: List loaded commands
        console.log("Commands loaded:");
        client.commands.forEach((cmd, name) => {
            console.log(`- ${name}`);
        });

        // Load events
        try {
            loadEvents(client);
            console.log("Events loaded successfully");
        } catch (error) {
            console.error('Error loading events, creating minimal events handler', error);
        }

        // We'll register commands once after the client is ready
        client.once('ready', async () => {
            console.log(`Bot is online! Logged in as ${client.user.tag}`);
            client.user.setActivity('Clash of Clans', { type: ActivityType.Playing });

            // Register commands manually after bot is ready
            await manuallyRegisterCommands();

            console.log('Bot initialization complete');
        });

        console.log('Connecting to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Add proper error handling for the /ip endpoint
app.get('/ip', async (req, res) => {
    // [... REST API ENDPOINT CODE UNCHANGED ...]
});

// Add proper error handling for the /proxy-test endpoint
app.get('/proxy-test', async (req, res) => {
    // [... REST API ENDPOINT CODE UNCHANGED ...]
});

// Add graceful shutdown handling
process.on('SIGTERM', async () => {
    // [... SHUTDOWN CODE UNCHANGED ...]
});

// Start the bot
init();