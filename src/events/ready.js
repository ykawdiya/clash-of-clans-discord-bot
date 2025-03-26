const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            console.log(`Ready! Logged in as ${client.user.tag}`);

            // Set bot activity
            client.user.setActivity('Clash of Clans', { type: 0 }); // 0 is Playing

            console.log(`Bot is now ready and serving ${client.guilds.cache.size} servers`);
        } catch (error) {
            console.error('Error in ready event:', error);
        }
    },
};