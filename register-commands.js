// register-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function registerCommands() {
    try {
        // Load commands
        const commands = [];
        const commandsPath = path.join(__dirname, './src/commands');

        console.log(`Looking for commands in: ${commandsPath}`);

        if (!fs.existsSync(commandsPath)) {
            console.error('Commands directory not found!');
            return;
        }

        // Read command folders (info, utility, etc.)
        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;

            // List files in the directory
            console.log(`Reading files from ${folder} folder...`);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);

            // Load each command file
            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                // Clear require cache
                delete require.cache[require.resolve(filePath)];

                try {
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

        if (commands.length === 0) {
            console.error('No commands found to register!');
            return;
        }

        // Register commands
        const clientId = process.env.CLIENT_ID; // Add CLIENT_ID to your .env file
        if (!clientId) {
            console.error('CLIENT_ID not set in .env file');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log(`Registering ${commands.length} commands...`);

        // For global commands:
        const result = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log(`Successfully registered ${result.length} global commands!`);

        // To register to a specific guild for faster testing, uncomment and set GUILD_ID in .env:
        /*
        const guildId = process.env.GUILD_ID;
        if (guildId) {
          const guildResult = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
          );
          console.log(`Successfully registered ${guildResult.length} commands to guild ${guildId}!`);
        }
        */

    } catch (error) {
        console.error('Error registering commands:');
        console.error(error);
    }
}

// Modify register-commands.js to include this (replace YOUR_GUILD_ID with your server ID)
const GUILD_ID = '1354151475009290352'; // Add your Discord server ID here

// Then in the registration code section:
// For guild-specific commands (appears instantly)
const guildResult = await rest.put(
    Routes.applicationGuildCommands(clientId, GUILD_ID),
    { body: commands }
);
console.log(`Successfully registered ${guildResult.length} commands to guild ${GUILD_ID}!`);

registerCommands();