// src/events/ready.js
const { system: log } = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    try {
      log.info(`Logged in as ${client.user.tag}!`);
      
      // Set bot activity
      client.user.setActivity('/help', { type: 'LISTENING' });
      
      // Log guild count
      log.info(`Bot is in ${client.guilds.cache.size} guilds`);
      
      // Log server names if in debug mode
      if (process.env.LOG_LEVEL === 'debug') {
        const guildNames = client.guilds.cache.map(guild => guild.name).join(', ');
        log.debug(`Guilds: ${guildNames}`);
      }
    } catch (error) {
      log.error('Error in ready event:', { error: error.message });
    }
  }
};
