const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { system: log } = require('../utils/logger');

// Map to store registered command IDs for cleanup
let registeredCommandIds = new Map();

/**
 * Load all command files from the commands directory
 */
function loadCommands() {
    // Collection to store commands
    const commands = [];
    const commandFiles = new Map();
    // Track command names to detect duplicates
    const commandNames = new Set();
    // Track command signatures for detecting similar commands
    const commandSignatures = new Map();

    try {
        const commandsPath = path.join(__dirname, '../commands');

        // Check if commands directory exists
        if (!fs.existsSync(commandsPath)) {
            log.warn('Commands directory not found, creating it...');
            fs.mkdirSync(commandsPath, { recursive: true });
            return { commands, commandFiles };
        }

        // Get all subdirectories (command categories)
        const commandFolders = fs.readdirSync(commandsPath)
            .filter(folder => {
                const folderPath = path.join(commandsPath, folder);
                return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
            });

        log.info(`Found ${commandFolders.length} command categories`);

        // Process each command folder
        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            // Load each command file
            for (const file of files) {
                const filePath = path.join(folderPath, file);
                try {
                    // Clear require cache to allow hot reloading
                    delete require.cache[require.resolve(filePath)];

                    // Load the command module
                    const command = require(filePath);

                    // Validate command structure
                    if (!command.data || !command.execute) {
                        log.warn(`Command ${file} is missing required properties`);
                        continue;
                    }

                    // Check for duplicate command names
                    const commandName = command.data.name;
                    if (commandNames.has(commandName)) {
                        log.error(`⚠️ DUPLICATE COMMAND DETECTED: "${commandName}" in ${folder}/${file}`);
                        log.error(`Another file already registered this command name. Skipping to avoid conflicts.`);
                        continue; // Skip this command
                    }

                    // Convert to JSON to get options for similarity check
                    let jsonData;
                    try {
                        jsonData = command.data.toJSON();
                    } catch (error) {
                        log.error(`Error converting command data to JSON for ${file}: ${error.message}`);
                        continue;
                    }

                    // Create a signature for the command structure (name + options)
                    const optionsSignature = JSON.stringify(jsonData.options || []);
                    const commandSignature = `${commandName}:${optionsSignature}`;

                    // Check for similar commands with different names (potential duplicates with typos)
                    for (const [existingName, existingSignature] of commandSignatures.entries()) {
                        const existingOptions = existingSignature.split(':')[1];
                        if (optionsSignature === existingOptions && commandName !== existingName) {
                            // Just warn but don't skip - could be intentional
                            log.warn(`Similar command structure detected: "${commandName}" and "${existingName}"`);
                            log.warn(`These commands have identical options which may confuse users.`);
                        }
                    }

                    // Add to tracking collections
                    commandNames.add(commandName);
                    commandSignatures.set(commandName, commandSignature);
                    commands.push(jsonData);
                    commandFiles.set(commandName, command);
                    log.info(`Loaded command: ${commandName} from ${folder}/${file}`);

                } catch (error) {
                    log.error(`Failed to load command from ${folder}/${file}: ${error.stack}`);
                }
            }
        }

        log.info(`Successfully loaded ${commands.length} commands`);
    } catch (error) {
        log.error('Error loading commands:', error.stack);
    }

    return { commands, commandFiles };
}

/**
 * Register slash commands with Discord API
 * Always replaces all commands to ensure no duplicates
 */
async function registerCommands(clientId, guildId = null) {
    const { commands } = loadCommands();

    if (commands.length === 0) {
        log.warn('No commands to register');
        return [];
    }

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        log.info(`Registering ${commands.length} commands to ${guildId ? 'guild' : 'global'} scope`);

        // Determine target endpoint based on scope
        const endpoint = guildId
            ? Routes.applicationGuildCommands(clientId, guildId)
            : Routes.applicationCommands(clientId);

        // First, get existing commands to track what needs to be removed
        const existingCommands = await rest.get(endpoint);
        const existingCommandMap = new Map();

        if (Array.isArray(existingCommands)) {
            existingCommands.forEach(cmd => {
                existingCommandMap.set(cmd.name, cmd.id);
            });
        }

        // Register all commands (this replaces existing ones)
        const data = await rest.put(endpoint, { body: commands });

        log.info(`Successfully registered ${data.length} commands`);

        // Track registered command IDs for cleanup
        if (Array.isArray(data)) {
            const scopeKey = guildId || 'global';
            registeredCommandIds.set(scopeKey, new Map());

            data.forEach(cmd => {
                registeredCommandIds.get(scopeKey).set(cmd.name, cmd.id);
            });
        }

        // Identify and log any removed commands
        const removedCommands = [];
        existingCommandMap.forEach((id, name) => {
            const stillExists = commands.some(cmd => cmd.name === name);
            if (!stillExists) {
                removedCommands.push(name);
            }
        });

        if (removedCommands.length > 0) {
            log.info(`Removed ${removedCommands.length} obsolete commands: ${removedCommands.join(', ')}`);
        }

        return data;
    } catch (error) {
        log.error('Error registering commands:', error.stack);

        // Provide helpful guidance for common errors
        if (error.message.includes('401')) {
            log.error('Authentication failed: Your Discord token may be invalid or expired');
        } else if (error.message.includes('403')) {
            log.error('Permission denied: Bot lacks permissions or application.commands scope');
        } else if (error.message.includes('404')) {
            log.error('Not found: Invalid client ID or guild ID');
        } else if (error.message.includes('429')) {
            log.error('Rate limited: Too many requests to the Discord API');
        }

        return [];
    }
}

/**
 * Check for orphaned commands and clean them up
 * @param {string} clientId - Bot's client ID
 */
async function cleanupOrphanedCommands(clientId) {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        // Get the current command set
        const { commands } = loadCommands();
        const currentCommandNames = new Set(commands.map(cmd => cmd.name));

        // Check global commands
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));

        if (Array.isArray(globalCommands)) {
            for (const cmd of globalCommands) {
                if (!currentCommandNames.has(cmd.name)) {
                    log.warn(`Found orphaned global command: ${cmd.name} (ID: ${cmd.id})`);
                    try {
                        await rest.delete(Routes.applicationCommand(clientId, cmd.id));
                        log.info(`Successfully deleted orphaned command: ${cmd.name}`);
                    } catch (deleteError) {
                        log.error(`Failed to delete orphaned command ${cmd.name}: ${deleteError.message}`);
                    }
                }
            }
        }

        log.info('Command cleanup completed');
    } catch (error) {
        log.error('Error during command cleanup:', error.message);
    }
}

module.exports = {
    loadCommands,
    registerCommands,
    cleanupOrphanedCommands
};