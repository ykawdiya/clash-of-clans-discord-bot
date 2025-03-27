const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Track if commands have been loaded already
let commandsLoaded = false;
let cachedCommands = [];
let cachedCommandFiles = new Map();

/**
 * Load all command files from the commands directory
 */
function loadCommands() {
    // If commands are already loaded, return cached version to prevent duplicate loading
    if (commandsLoaded && cachedCommands.length > 0) {
        console.log('Using cached commands to prevent reloading');
        return { commands: cachedCommands, commandFiles: cachedCommandFiles };
    }

    // Collection to store commands
    const commands = [];
    const commandFiles = new Map();

    try {
        const commandsPath = path.join(__dirname, '../commands');
        console.log(`🔍 Looking for commands in: ${commandsPath}`);

        // Check if commands directory exists
        if (!fs.existsSync(commandsPath)) {
            console.log('❌ Commands directory not found, creating it...');
            fs.mkdirSync(commandsPath, { recursive: true });
            return { commands, commandFiles };
        }

        // Read all subdirectories
        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`📁 Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;

            // List files in the folder
            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`📄 Files in ${folder} folder: ${files.join(', ')}`);

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                try {
                    // We use require for CommonJS, but handle errors gracefully
                    let command;
                    try {
                        delete require.cache[require.resolve(filePath)];
                        command = require(filePath);
                    } catch (err) {
                        console.error(`Failed to load command at ${filePath}:`, err.message);
                        continue;
                    }

                    // Validate command structure
                    if ('data' in command && 'execute' in command) {
                        console.log(`✅ Loaded command: ${command.data.name} (from ${file})`);
                        commands.push(command.data.toJSON());
                        commandFiles.set(command.data.name, command);
                    } else {
                        console.warn(`⚠️ Command at ${filePath} is missing required "data" or "execute" properties`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command from ${filePath}:`, error);
                }
            }
        }

        console.log(`📊 Total commands loaded: ${commands.length}`);

        // Cache the loaded commands
        cachedCommands = commands;
        cachedCommandFiles = commandFiles;
        commandsLoaded = true;
    } catch (error) {
        console.error('🚨 Error loading commands:', error);
    }

    return { commands, commandFiles };
}

/**
 * Register slash commands with Discord API
 */
async function registerCommands(clientId, guildId = null) {
    const { commands } = loadCommands();

    if (commands.length === 0) {
        console.log('❌ No commands to register');
        return [];
    }

    // Explicitly set the REST version
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`🚀 Registering ${commands.length} application (/) commands`);
        console.log(`👤 Client ID: ${clientId}`);
        console.log(`🏠 Guild ID: ${guildId || 'Global registration'}`);

        // Register commands based on environment
        let data;
        if (guildId) {
            // Guild commands - for testing, updates instantly
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`✅ Successfully registered ${data.length} guild (/) commands`);
        } else {
            // Global commands - for production, can take up to an hour to update
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log(`✅ Successfully registered ${data.length} global (/) commands`);
        }

        return data;
    } catch (error) {
        console.error('🚨 Error registering commands:', error);
        console.error('Error details:', error.message);

        // Log more detailed error information
        if (error.rawError) {
            console.error('Discord API error details:', JSON.stringify(error.rawError, null, 2));
        }

        return [];
    }
}

module.exports = {
    loadCommands,
    registerCommands
};