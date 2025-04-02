// src/index.js - Modified for debugging
require('dotenv').config();
const { system: log } = require('./utils/logger');
const bot = require('./bot');

// Debug memory usage
function logMemoryUsage() {
  const used = process.memoryUsage();
  log.info('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(used.external / 1024 / 1024)} MB`
  });
}

// Unhandled promise rejection handler
process.on('unhandledRejection', (error) => {
  log.error('Unhandled promise rejection:', { error: error.stack || error.message || error });
  logMemoryUsage();
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', { error: error.stack || error.message || error });
  logMemoryUsage();

  // Instead of exiting immediately, give time to log the error
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Start the bot with debugging
(async () => {
  try {
    log.info('Starting Clash of Clans Discord Bot with debug monitoring...');

    // Set up memory logging interval
    setInterval(logMemoryUsage, 60000); // Every minute

    // Initial memory usage
    logMemoryUsage();

    // Start the bot normally with its existing init function
    await bot.init();
    log.info('Bot started successfully!');

    // Log memory after startup
    logMemoryUsage();
  } catch (error) {
    log.error('Failed to start bot:', { error: error.stack || error.message || error });
    logMemoryUsage();
    process.exit(1);
  }
})();