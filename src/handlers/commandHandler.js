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

        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;

            // Check if any command files exist in this folder
            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            if (files.length === 0) {
                console.log(`No command files found in ${folder} directory.`);
                continue;
            }

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                try {
                    const command = require(filePath);

                    // Check if command has required properties
                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                        commandFiles.set(command.data.name, command);
                        console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.warn(`The command at ${filePath} is missing required "data" or "execute" properties.`);
                    }
                } catch (error) {
                    console.error(`Error loading command from ${filePath}:`, error);
                }
            }
        }

        console.log(`Loaded ${commands.length} commands successfully.`);
    } catch (error) {
        console.error('Error loading commands:', error);
    }

    return { commands, commandFiles };
}

/**
 * Register slash commands with Discord API
 */
async function registerCommands(clientId, guildId = null) {
    const { commands } = loadCommands();

    if (commands.length === 0) {
        console.log('No commands to register.');
        return [];
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        let data;

        if (guildId) {
            // Guild commands - for testing, updates instantly
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`Successfully reloaded ${data.length} guild (/) commands.`);
        } else {
            // Global commands - for production, can take up to an hour to update
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log(`Successfully reloaded ${data.length} global (/) commands.`);
        }

        return data;
    } catch (error) {
        console.error('Error registering commands:', error);
        return [];
    }
}

module.exports = {
    loadCommands,
    registerCommands
};