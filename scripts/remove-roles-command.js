// scripts/remove-roles-command.js
require('dotenv').config();
const { REST } = require('discord.js');
const { Routes } = require('discord.js');

async function removeRolesCommand() {
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        console.error('Missing required environment variables: DISCORD_TOKEN and CLIENT_ID');
        process.exit(1);
    }

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.CLIENT_ID;

    console.log('Starting roles command removal process...');

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