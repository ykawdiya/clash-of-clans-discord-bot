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
        console.error('Error registering commands:', error);
        return [];
    }
}

// Register commands properly with both global and guild-specific registration
async function init() {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

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

        // Register global commands
        console.log(`Registering ${commands.length} application commands globally...`);
        const globalResult = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        console.log(`Successfully registered ${globalResult.length} global commands!`);

        // Register guild commands if GUILD_ID is provided
        if (guildId) {
            console.log(`Registering ${commands.length} application commands to guild ${guildId}...`);
            const guildResult = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`Successfully registered ${guildResult.length} commands to guild ${guildId}!`);
        } else {
            console.warn('GUILD_ID not set in .env file. Skipping guild command registration.');
        }
    } catch (error) {
        console.error('Error during command registration:', error);
    }
}

// Run the command registration
init();