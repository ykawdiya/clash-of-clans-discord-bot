// scripts/remove-roles-command.js
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

async function removeRolesCommand() {
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
            runRemoval(tokenFromArgs, clientIdFromArgs);
        } else {
            console.log('\nAs an alternative, you can run the script with:');
            console.log('node remove-roles-command.js --token=YOUR_TOKEN --clientId=YOUR_CLIENT_ID\n');
            process.exit(1);
        }
    } else {
        runRemoval(token, clientId);
    }
}

async function runRemoval(token, clientId) {
    console.log('Starting roles command removal process...');

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        // Check global commands
        console.log('Fetching registered global commands...');
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));

        // Find roles command
        const rolesCommand = globalCommands.find(cmd => cmd.name === 'roles');

        if (rolesCommand) {
            console.log(`Found 'roles' command (ID: ${rolesCommand.id}). Deleting...`);
            await rest.delete(Routes.applicationCommand(clientId, rolesCommand.id));
            console.log('Successfully deleted roles command from global commands');
        } else {
            console.log('No global roles command found.');
        }

        // Check guild-specific commands if GUILD_ID is set
        if (process.env.GUILD_ID) {
            const guildId = process.env.GUILD_ID;
            console.log(`Checking for roles command in guild ${guildId}...`);

            const guildCommands = await rest.get(
                Routes.applicationGuildCommands(clientId, guildId)
            );

            const guildRolesCommand = guildCommands.find(cmd => cmd.name === 'roles');

            if (guildRolesCommand) {
                console.log(`Found 'roles' command in guild (ID: ${guildRolesCommand.id}). Deleting...`);
                await rest.delete(
                    Routes.applicationGuildCommand(clientId, guildId, guildRolesCommand.id)
                );
                console.log('Successfully deleted roles command from guild commands');
            } else {
                console.log('No guild roles command found.');
            }
        }

        console.log('Roles command removal completed successfully!');
    } catch (error) {
        console.error('Error during roles command removal:', error);
        process.exit(1);
    }
}

// Run the removal process
removeRolesCommand().catch(error => {
    console.error('Unhandled error during removal:', error);
    process.exit(1);
});