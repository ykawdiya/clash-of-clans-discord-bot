// src/deploy-guild-commands-fixed.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Configuration
const clientId = process.env.CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID || '';

if (!guildId) {
    console.error('❌ ERROR: No GUILD_ID provided in .env file or directly in this script!');
    process.exit(1);
}

// Function to find root command files (not in subdirectories)
const getRootCommandFiles = (dir) => {
    return fs.readdirSync(dir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
};

async function deployCommands() {
    try {
        console.log('🚀 Starting GUILD-SPECIFIC command deployment with hierarchy fix...');
        console.log(`📝 Using Guild ID: ${guildId}`);

        // Create REST instance
        const rest = new REST({ version: '9' }).setToken(token);

        // First, check existing commands
        console.log('🔍 Checking existing guild commands...');
        try {
            const existingCommands = await rest.get(
                Routes.applicationGuildCommands(clientId, guildId)
            );
            console.log(`Found ${existingCommands.length} existing guild commands:`);
            existingCommands.forEach(cmd => console.log(`- ${cmd.name}`));
        } catch (error) {
            console.error('❌ Error checking existing commands:', error.message);
        }

        // Find all root command files (avoid subdirectory files)
        const commandsDir = path.join(__dirname, 'commands');
        const commandFiles = getRootCommandFiles(commandsDir);

        // Add the ping command to test
        const pingCommandPath = path.join(commandsDir, 'ping.js');
        if (fs.existsSync(pingCommandPath)) {
            commandFiles.push(pingCommandPath);
        }

        console.log(`📂 Found ${commandFiles.length} root command files`);

        // Commands to register
        const guildCommands = [];
        const failedCommands = [];

        // Process each root command file
        for (const filePath of commandFiles) {
            try {
                const command = require(filePath);
                const relativePath = path.relative(process.cwd(), filePath);
                const fileName = path.basename(filePath);

                // Skip files without data property
                if (!command.data) {
                    console.log(`⚠️ Skipping ${relativePath} - no data property`);
                    continue;
                }

                // Verify that data.toJSON exists
                if (typeof command.data.toJSON !== 'function') {
                    console.error(`❌ Error in ${relativePath}: command.data.toJSON is not a function`);
                    failedCommands.push({ file: relativePath, error: 'No toJSON method' });
                    continue;
                }

                // Get JSON data for command
                try {
                    const commandJSON = command.data.toJSON();
                    guildCommands.push(commandJSON);
                    console.log(`✅ Added command: ${commandJSON.name} (${relativePath})`);
                } catch (error) {
                    console.error(`❌ Error converting command in ${relativePath} to JSON:`, error.message);
                    failedCommands.push({ file: relativePath, error: error.message });
                }
            } catch (error) {
                const relativePath = path.relative(process.cwd(), filePath);
                console.error(`❌ Error loading command file ${relativePath}:`, error.message);
                failedCommands.push({ file: relativePath, error: error.message });
            }
        }

        if (guildCommands.length === 0) {
            console.error('❌ No valid commands found to deploy');
            console.error('Commands with errors:');
            failedCommands.forEach(cmd => {
                console.error(`- ${cmd.file}: ${cmd.error}`);
            });
            return;
        }

        // Deploy guild commands
        console.log(`🚀 Deploying ${guildCommands.length} commands to guild ${guildId}...`);

        // Show command structure for debugging
        console.log("\nCommand structure to be deployed:");
        guildCommands.forEach(cmd => {
            console.log(`- ${cmd.name}`);
        });

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: guildCommands }
        );

        console.log(`✅ Successfully deployed ${data.length} commands to guild!`);

        if (failedCommands.length > 0) {
            console.warn(`⚠️ ${failedCommands.length} commands failed to load:`);
            failedCommands.forEach(cmd => {
                console.warn(`- ${cmd.file}: ${cmd.error}`);
            });
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

deployCommands();