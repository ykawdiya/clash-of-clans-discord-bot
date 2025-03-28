const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Load all command files from the commands directory
 */
function loadCommands() {
    // Collection to store commands
    const commands = [];
    const commandFiles = new Map();

    try {
        const commandsPath = path.join(__dirname, '../commands');

        // Check if commands directory exists
        if (!fs.existsSync(commandsPath)) {
            console.log('Commands directory not found, creating it...');
            fs.mkdirSync(commandsPath, { recursive: true });
            return { commands, commandFiles };
        }

        // Get all subdirectories (command categories)
        const commandFolders = fs.readdirSync(commandsPath)
            .filter(folder => {
                const folderPath = path.join(commandsPath, folder);
                return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
            });

        console.log(`Found ${commandFolders.length} command categories`);

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

                    // Validate command structure and convert to JSON in one step
                    if (!command.data || !command.execute) {
                        console.warn(`Command ${file} is missing required properties`);
                        continue;
                    }

                    try {
                        // Convert command data to JSON
                        const jsonData = command.data.toJSON();
                        commands.push(jsonData);
                        commandFiles.set(command.data.name, command);
                        console.log(`Loaded command: ${command.data.name}`);
                    } catch (error) {
                        console.error(`Error loading ${file}: ${error.message}`);
                    }
                } catch (error) {
                    console.error(`Failed to load command from ${file}: ${error.message}`);
                }
            }
        }

        console.log(`Successfully loaded ${commands.length} commands`);
    } catch (error) {
        console.error('Error loading commands:', error.message);
    }

    return { commands, commandFiles };
}

/**
 * Register slash commands with Discord API
 */
async function registerCommands(clientId, guildId = null) {
    const { commands } = loadCommands();

    if (commands.length === 0) {
        console.log('No commands to register');
        return [];
    }

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`Registering ${commands.length} commands to ${guildId ? 'guild' : 'global'} scope`);

        // Determine target endpoint based on scope
        const endpoint = guildId
            ? Routes.applicationGuildCommands(clientId, guildId)
            : Routes.applicationCommands(clientId);

        // Register commands
        const data = await rest.put(endpoint, { body: commands });

        console.log(`Successfully registered ${data.length} commands`);
        return data;
    } catch (error) {
        console.error('Error registering commands:', error.message);

        // Provide helpful guidance for common errors
        if (error.message.includes('401')) {
            console.error('Authentication failed: Your Discord token may be invalid or expired');
        } else if (error.message.includes('403')) {
            console.error('Permission denied: Bot lacks permissions or application.commands scope');
        } else if (error.message.includes('404')) {
            console.error('Not found: Invalid client ID or guild ID');
        } else if (error.message.includes('429')) {
            console.error('Rate limited: Too many requests to the Discord API');
        }

        return [];
    }
}

module.exports = {
    loadCommands,
    registerCommands
};