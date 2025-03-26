// src/events/ready.js
const { Events } = require('discord.js');
const { registerCommands } = require('../handlers/commandHandler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            console.log(`Ready! Logged in as ${client.user.tag}`);

            // Register slash commands
            console.log('Registering slash commands...');
            await registerCommands(client.user.id)
                .catch(error => console.error('Failed to register commands:', error));

            // Set bot activity
            client.user.setActivity('Clash of Clans', { type: 0 }); // 0 is Playing

            console.log(`Bot is now ready and serving ${client.guilds.cache.size} servers`);
        } catch (error) {
            console.error('Error in ready event:', error);
        }
    },
};