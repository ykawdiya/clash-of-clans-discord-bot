require('dotenv').config();
const { REST, Routes } = require('discord.js');

async function deleteCommands() {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
        console.error('CLIENT_ID is not set in the .env file');
        process.exit(1);
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        // Delete global commands
        console.log('Deleting all global commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );
        console.log('Successfully deleted all global commands!');

        // Delete guild commands if GUILD_ID is provided
        if (guildId) {
            console.log(`Deleting all commands from guild ${guildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: [] }
            );
            console.log(`Successfully deleted all commands from guild ${guildId}!`);
        }

        console.log('All commands have been deleted. You can now re-register them.');
    } catch (error) {
        console.error('Error deleting commands:', error);
    }
}

// Run the deletion process
deleteCommands();