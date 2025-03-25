// Import required packages
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Add this after your initial require statements
console.log('Starting CoC Discord Bot - Version 1.0.1');
console.log('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKeyConfigured: process.env.COC_API_KEY ? 'Yes' : 'No',
    port: process.env.PORT || 3000
});

// Check for DISCORD_TOKEN
if (!process.env.DISCORD_TOKEN) {
    console.error('FATAL: DISCORD_TOKEN is not set in environment variables.');
    process.exit(1);
}

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
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Ensure Express server stops when bot exits
process.on('SIGINT', () => {
    console.log('Shutting down...');
    app.close(() => {
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
    const pingCommandPath = path.join(__dirname, 'commands/utility/ping.js');

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

// Create ready event file if it doesn't exist
const createReadyEvent = () => {
    const readyEventPath = path.join(__dirname, 'events/ready.js');

    if (!fs.existsSync(readyEventPath)) {
        const readyEventContent = `const { Events } = require('discord.js');
const { registerCommands } = require('../handlers/commandHandler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            console.log(\`Ready! Logged in as \${client.user.tag}\`);
            
            // Register slash commands
            await registerCommands(client.user.id)
                .catch(error => console.error('Failed to register commands:', error));
                
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
        console.log('Created ready event file');
    }
};

// Create interactionCreate event file if it doesn't exist
const createInteractionEvent = () => {
    const interactionEventPath = path.join(__dirname, 'events/interactionCreate.js');

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

        // Rest of the init function remains the same...
        createDirectories();
        createTestCommand();
        createReadyEvent();
        createInteractionEvent();
        const { commandFiles } = loadCommands();
        commandFiles.forEach((command, name) => {
            client.commands.set(name, command);
        });
        console.log(`Loaded ${client.commands.size} commands to client collection`);
        try {
            loadEvents(client);
        } catch (error) {
            console.error('Error loading events, creating minimal events handler', error);
            client.once('ready', async () => {
                console.log(`Ready! Logged in as ${client.user.tag}`);
                client.user.setActivity('Clash of Clans', { type: 0 });
            });
        }
        console.log('Connecting to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Replace your current /ip endpoint with this enhanced version
app.get('/ip', async (req, res) => {
    try {
        // Get IP information from various sources
        const networkInfo = {
            // What Railway sees as your request IP
            requestIP: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            // All headers for debugging
            headers: req.headers,
            // Environment variables (sanitized)
            env: {
                COC_API_KEY_SET: process.env.COC_API_KEY ? 'Yes (starts with ' + process.env.COC_API_KEY.substring(0, 3) + '...)' : 'No',
                DISCORD_TOKEN_SET: process.env.DISCORD_TOKEN ? 'Yes' : 'No',
                MONGODB_URI_SET: process.env.MONGODB_URI ? 'Yes' : 'No'
            }
        };

        // Try to fetch an external service to see what IP we're showing
        try {
            const axios = require('axios');
            const ipResponse = await axios.get('https://api.ipify.org?format=json');
            networkInfo.outboundIP = ipResponse.data.ip;
        } catch (error) {
            networkInfo.ipFetchError = error.message;
        }

        // Test the Clash of Clans API
        try {
            // Import API service
            const clashApiService = require('./services/clashApiService');

            // Try a simple API call to check connection
            const clans = await clashApiService.searchClans({ name: 'Clash', limit: 1 });
            networkInfo.cocApiStatus = 'Working! The API is accessible.';
            networkInfo.cocApiSample = {
                itemCount: clans.items?.length || 0,
                firstItem: clans.items?.[0]?.name || 'None found'
            };
        } catch (error) {
            networkInfo.cocApiStatus = 'Error connecting to Clash of Clans API';
            networkInfo.cocApiError = error.message;

            if (error.response) {
                networkInfo.cocApiStatusCode = error.response.status;
                networkInfo.cocApiErrorData = error.response.data;
            }
        }

        console.log('IP Information:', JSON.stringify(networkInfo, null, 2));
        res.json(networkInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add this to your src/index.js file

// Test proxy configuration
app.get('/proxy-test', async (req, res) => {
    try {
        const clashApiService = require('./services/clashApiService');

        // Test the proxy connection
        const proxyTest = await clashApiService.testProxyConnection();

        // If proxy test is successful, try to make a simple Clash API request
        let cocApiTest = { success: false, message: 'Not tested' };
        if (proxyTest.success) {
            try {
                // Try to search for a clan (simple API request)
                const searchResults = await clashApiService.searchClans({ name: 'Clash', limit: 1 });
                cocApiTest = {
                    success: true,
                    message: 'Successfully connected to Clash of Clans API',
                    sampleData: {
                        totalResults: searchResults.items?.length || 0,
                        firstClan: searchResults.items?.[0]?.name || 'None found'
                    }
                };
            } catch (error) {
                cocApiTest = {
                    success: false,
                    message: 'Failed to connect to Clash of Clans API',
                    error: error.message,
                    statusCode: error.response?.status,
                    errorData: error.response?.data
                };
            }
        }

        // Prepare response with test results
        const testResults = {
            timestamp: new Date().toISOString(),
            proxyTest,
            cocApiTest,
            environment: {
                proxyConfigured: !!(process.env.PROXY_HOST && process.env.PROXY_PORT &&
                    process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD),
                apiKeyConfigured: !!process.env.COC_API_KEY,
                nodeEnv: process.env.NODE_ENV || 'development'
            }
        };

        res.json(testResults);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error running proxy test',
            error: error.message
        });
    }
});

const databaseService = require('./services/databaseService');

// Start the bot
init();