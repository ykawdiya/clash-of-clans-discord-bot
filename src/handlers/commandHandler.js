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
                    // Clear require cache to ensure fresh command data
                    delete require.cache[require.resolve(filePath)];

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

    // Explicitly set the REST version to ensure compatibility
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        console.log(`Client ID: ${clientId}`);
        console.log(`Guild ID: ${guildId || 'Global registration'}`);

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
        console.error('Error details:', error.message);

        // Log more detailed error information
        if (error.rawError) {
            console.error('Discord API error details:', JSON.stringify(error.rawError, null, 2));
        }

        // Check for common errors
        if (error.message.includes('401')) {
            console.error('Authentication failed. Check your Discord token.');
        } else if (error.message.includes('403')) {
            console.error('Authorization failed. Make sure your bot has the applications.commands scope.');
        } else if (error.message.includes('missing access')) {
            console.error('Missing access. Your bot may not have the necessary permissions.');
        }

        return [];
    }
}

module.exports = {
    loadCommands,
    registerCommands
};