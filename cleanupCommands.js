// Save this as cleanupCommands.js in your project root
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Your bot's client ID from the .env file
const clientId = process.env.CLIENT_ID;
// Your guild ID from the .env file (if any)
const guildId = process.env.GUILD_ID;

// Create a new REST instance
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

// Function to remove all commands
async function cleanupCommands() {
    try {
        console.log('Started cleanup of application commands...');

        // Remove global commands
        console.log('Removing global commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );
        console.log('Successfully removed all global commands.');

        // Remove guild commands if GUILD_ID exists
        if (guildId) {
            console.log(`Removing guild commands from guild ${guildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: [] }
            );
            console.log(`Successfully removed all commands from guild ${guildId}.`);
        }

        console.log('Command cleanup complete! Restart your bot to register fresh commands.');
    } catch (error) {
        console.error(error);
    }
}

cleanupCommands();