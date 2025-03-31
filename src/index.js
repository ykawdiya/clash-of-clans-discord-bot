// src/index.js
require('dotenv').config();
const { system: log } = require('./utils/logger');
const bot = require('./bot');

// Unhandled promise rejection handler
process.on('unhandledRejection', (error) => {
  log.error('Unhandled promise rejection:', { error: error.stack || error.message || error });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', { error: error.stack || error.message || error });
  
  // Exit with error
  process.exit(1);
});

// Start the bot
(async () => {
  try {
    log.info('Starting Clash of Clans Discord Bot...');
    await bot.init();
    log.info('Bot started successfully!');
  } catch (error) {
    log.error('Failed to start bot:', { error: error.stack || error.message || error });
    process.exit(1);
  }
})();
