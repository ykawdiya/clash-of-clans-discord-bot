// scripts/cleanup-commands.js
const fs = require('fs');
const path = require('path');
const { REST } = require('discord.js');
const { Routes } = require('discord.js');

// Path resolution for .env file
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    // Load .env file from the parent directory
    require('dotenv').config({ path: envPath });
    console.log('Loaded environment from ../.env');
} else {
    // Try loading from current directory as fallback
    require('dotenv').config();
    console.log('Attempted to load environment from default location');
}

async function cleanupCommands() {
    // Check for required environment variables
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
        console.error('Missing required environment variables: DISCORD_TOKEN and CLIENT_ID');
        console.log('Please make sure these are defined in your .env file');
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Attempted to load from: ${envPath}`);

        // Try to extract from command line arguments as a fallback
        const args = process.argv.slice(2);
        const tokenArg = args.find(arg => arg.startsWith('--token='));
        const clientIdArg = args.find(arg => arg.startsWith('--clientId='));

        const tokenFromArgs = tokenArg ? tokenArg.split('=')[1] : null;
        const clientIdFromArgs = clientIdArg ? clientIdArg.split('=')[1] : null;

        if (tokenFromArgs && clientIdFromArgs) {
            console.log('Using token and clientId from command line arguments');
            runCleanup(tokenFromArgs, clientIdFromArgs);
        } else {
            console.log('\nAs an alternative, you can run the script with:');
            console.log('node cleanup-commands.js --token=YOUR_TOKEN --clientId=YOUR_CLIENT_ID\n');
            process.exit(1);
        }
    } else {
        runCleanup(token, clientId);
    }
}

async function runCleanup(token, clientId) {
    console.log('Starting command cleanup process...');

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        // Collect valid command names from all command files
        const validCommandNames = new Set();
        const commandsPath = path.join(__dirname, '../src/commands');

        // Exit if the commands directory doesn't exist
        if (!fs.existsSync(commandsPath)) {
            console.error('Commands directory not found');
            process.exit(1);
        }

        // Scan all command folders
        const commandFolders = fs.readdirSync(commandsPath).filter(folder => {
            const folderPath = path.join(commandsPath, folder);
            return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
        });

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(folderPath, file);
                    const command = require(filePath);

                    if (command.data && command.data.name) {
                        validCommandNames.add(command.data.name);
                    }
                } catch (error) {
                    console.error(`Error loading command from ${file}:`, error);
                }
            }
        }

        console.log(`Found ${validCommandNames.size} valid commands in command files`);

        // Check global commands
        console.log('Fetching registered global commands...');
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));

        console.log(`Found ${globalCommands.length} global commands registered on Discord`);

        // Find orphaned commands
        const orphanedGlobalCommands = globalCommands.filter(cmd => !validCommandNames.has(cmd.name));

        if (orphanedGlobalCommands.length > 0) {
            console.log(`Found ${orphanedGlobalCommands.length} orphaned global commands to delete:`);

            for (const cmd of orphanedGlobalCommands) {
                console.log(`Deleting global command: ${cmd.name} (ID: ${cmd.id})`);
                try {
                    await rest.delete(Routes.applicationCommand(clientId, cmd.id));
                    console.log(`Successfully deleted command: ${cmd.name}`);
                } catch (error) {
                    console.error(`Failed to delete command ${cmd.name}:`, error);
                }

                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            console.log('No orphaned global commands found.');
        }

        // Check guild-specific commands if GUILD_ID is set
        if (process.env.GUILD_ID) {
            const guildId = process.env.GUILD_ID;
            console.log(`Checking commands for guild ${guildId}...`);

            const guildCommands = await rest.get(
                Routes.applicationGuildCommands(clientId, guildId)
            );

            console.log(`Found ${guildCommands.length} guild commands registered on Discord`);

            // Find orphaned guild commands
            const orphanedGuildCommands = guildCommands.filter(cmd => !validCommandNames.has(cmd.name));

            if (orphanedGuildCommands.length > 0) {
                console.log(`Found ${orphanedGuildCommands.length} orphaned guild commands to delete:`);

                for (const cmd of orphanedGuildCommands) {
                    console.log(`Deleting guild command: ${cmd.name} (ID: ${cmd.id})`);
                    try {
                        await rest.delete(
                            Routes.applicationGuildCommand(clientId, guildId, cmd.id)
                        );
                        console.log(`Successfully deleted guild command: ${cmd.name}`);
                    } catch (error) {
                        console.error(`Failed to delete guild command ${cmd.name}:`, error);
                    }

                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } else {
                console.log('No orphaned guild commands found.');
            }
        }

        console.log('Command cleanup completed successfully!');
    } catch (error) {
        console.error('Error during command cleanup:', error);
        process.exit(1);
    }
}

// Run the cleanup
cleanupCommands().catch(error => {
    console.error('Unhandled error during cleanup:', error);
    process.exit(1);
});