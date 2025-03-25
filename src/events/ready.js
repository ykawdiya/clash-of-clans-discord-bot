const { Events, ActivityType } = require('discord.js');
const { registerCommands } = require('../handlers/commandHandler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

            // Register slash commands
            if (process.env.NODE_ENV === 'development') {
                await registerCommands(client.user.id)
                    .catch(error => console.error('Failed to register commands:', error));
            }

            // Set bot activity
            client.user.setActivity('Clash of Clans', { type: ActivityType.Playing });

            console.log(`🌍 Serving ${client.guilds.cache.size} servers`);
        } catch (error) {
            console.error('Error in ready event:', error);
        }
    },
};