// src/index.js - Fixed and optimized for Railway
require('dotenv').config();
const { system: log } = require('./utils/logger');
const bot = require('./bot');
const mongoose = require('mongoose');

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

// Start the bot with each step separated for debugging
(async () => {
  try {
    log.info('Starting Clash of Clans Discord Bot with debug monitoring...');

    // Set up memory logging interval
    const memoryInterval = setInterval(logMemoryUsage, 60000); // Every minute

    // Initial memory usage
    logMemoryUsage();

    // Step 1: Connect to MongoDB directly instead of using bot.connectDatabase
    try {
      log.info('Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      log.info('Connected to MongoDB successfully');
    } catch (mongoError) {
      log.error('MongoDB connection error:', { error: mongoError.message });
      throw new Error(`MongoDB connection failed: ${mongoError.message}`);
    }

    // Step 2: Load commands
    try {
      log.info('Loading commands...');
      await bot.loadCommands();
      log.info(`Loaded ${bot.client.commands.size} commands`);
    } catch (commandsError) {
      log.error('Error loading commands:', { error: commandsError.message });
      throw new Error(`Command loading failed: ${commandsError.message}`);
    }

    // Step 3: Load events
    try {
      log.info('Loading events...');
      await bot.loadEvents();
      log.info('Events loaded successfully');
    } catch (eventsError) {
      log.error('Error loading events:', { error: eventsError.message });
      throw new Error(`Event loading failed: ${eventsError.message}`);
    }

    // Step 4: Login to Discord
    try {
      log.info('Logging in to Discord...');
      await bot.client.login(process.env.DISCORD_TOKEN);
      log.info(`Logged in as ${bot.client.user.tag}`);
    } catch (loginError) {
      log.error('Discord login error:', { error: loginError.message });
      throw new Error(`Discord login failed: ${loginError.message}`);
    }

    // Memory check after basic initialization
    logMemoryUsage();

    // Step 5: Start tracking services one by one
    try {
      // Start War tracking service
      log.info('Starting War tracking service...');
      const warTrackingService = require('./services/warTrackingService');
      await warTrackingService.startWarMonitoring();
      log.info('War tracking service started');
      logMemoryUsage();

      // Brief pause to allow stabilization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start CWL tracking service
      log.info('Starting CWL tracking service...');
      const cwlTrackingService = require('./services/cwlTrackingService');
      await cwlTrackingService.startCWLMonitoring();
      log.info('CWL tracking service started');
      logMemoryUsage();

      // Brief pause to allow stabilization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start Capital tracking service
      log.info('Starting Capital tracking service...');
      const capitalTrackingService = require('./services/capitalTrackingService');
      await capitalTrackingService.startCapitalMonitoring();
      log.info('Capital tracking service started');
    } catch (trackingError) {
      log.error('Error starting tracking services:', { error: trackingError.message });
      throw new Error(`Tracking services failed: ${trackingError.message}`);
    }

    log.info('Bot started successfully!');
    logMemoryUsage();
  } catch (error) {
    log.error('Failed to start bot:', { error: error.stack || error.message || error });
    logMemoryUsage();
    process.exit(1);
  }
})();