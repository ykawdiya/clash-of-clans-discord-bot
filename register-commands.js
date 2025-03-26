require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function registerCommands() {
    const commands = []; // Define commands inside the function

    try {
        const commandsPath = path.join(process.cwd(), './src/commands');
        console.log(`Looking for commands in: ${commandsPath}`);

        if (!fs.existsSync(commandsPath)) {
            console.error('Commands directory not found!');
            return [];
        }

        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            console.log(`Reading files from ${folder} folder...`);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    // We use require for CommonJS
                    const command = require(filePath);
                    if (command.data && command.execute) {
                        commands.push(command.data.toJSON());
                        console.log(`✅ Added ${command.data.name} command`);
                    } else {
                        console.warn(`⚠️ Command at ${filePath} is missing required properties`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command from ${filePath}:`, error);
                }
            }
        }

        return commands; // Return commands for use outside
    } catch (error) {
        console.error('Error loading commands:', error);
        return [];
    }
}

// Register commands properly with development mode
async function init() {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!clientId) {
        console.error('CLIENT_ID is not set in the .env file');
        process.exit(1);
    }

    try {
        // Load all commands
        const commands = await registerCommands();

        if (commands.length === 0) {
            console.error('No commands found to register!');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        // Check for development mode and GUILD_ID
        if (isDevelopment && guildId) {
            console.log(`DEVELOPMENT MODE: Registering commands to guild ${guildId} only...`);

            // First, clear any existing global commands to avoid duplicates
            console.log("Removing any existing global commands...");
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: [] }
            );
            console.log("Global commands cleared.");

            // Then register guild-specific commands
            console.log(`Registering ${commands.length} application commands to guild ${guildId}...`);
            const guildResult = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`Successfully registered ${guildResult.length} commands to guild ${guildId}!`);
            console.log("Guild commands update instantly. Use these for development.");
        } else {
            // Production mode: register globally
            console.log(`PRODUCTION MODE: Registering ${commands.length} application commands globally...`);

            // First, clear any guild-specific commands to avoid duplicates
            if (guildId) {
                console.log(`Removing any existing guild commands from ${guildId}...`);
                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: [] }
                );
                console.log("Guild commands cleared.");
            }

            // Then register global commands
            const globalResult = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log(`Successfully registered ${globalResult.length} global commands!`);
            console.log("NOTE: Global commands can take up to an hour to update across all servers.");
        }
    } catch (error) {
        console.error('Error during command registration:', error);
    }
}

// Run the command registration
init();