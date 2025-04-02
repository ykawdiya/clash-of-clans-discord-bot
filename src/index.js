// src/index.js - Complete rewrite to work with existing bot structure
require('dotenv').config();
const { system: log } = require('./utils/logger');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

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

// Create functions for all the bot initialization steps
// We'll duplicate the bot.js functionality here to avoid binding issues
async function initializeBot() {
  try {
    log.info('Starting Clash of Clans Discord Bot with debug monitoring...');

    // Set up memory logging interval
    const memoryInterval = setInterval(logMemoryUsage, 60000); // Every minute

    // Initial memory usage
    logMemoryUsage();

    // Create Discord client directly
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    client.commands = new Collection();

    // Make client globally accessible
    global.client = client;

    // Step 1: Connect to MongoDB directly
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

    // Step 2: Load commands directly
    try {
      log.info('Loading commands...');
      const commandsDir = path.join(__dirname, 'commands');
      const commandFiles = getFiles(commandsDir).filter(file => file.endsWith('.js'));

      for (const file of commandFiles) {
        try {
          const command = require(file);

          // Set a name for the command
          const commandName = command.data?.name || path.basename(file, '.js');

          // Add command to collection
          client.commands.set(commandName, command);

          log.info(`Loaded command: ${commandName}`);
        } catch (error) {
          log.error(`Error loading command file ${file}:`, { error: error.message });
        }
      }

      log.info(`Loaded ${client.commands.size} commands`);
    } catch (commandsError) {
      log.error('Error loading commands:', { error: commandsError.message });
      throw new Error(`Command loading failed: ${commandsError.message}`);
    }

    // Step 3: Load events directly
    try {
      log.info('Loading events...');
      const eventsDir = path.join(__dirname, 'events');
      const eventFiles = fs.readdirSync(eventsDir).filter(file => file.endsWith('.js'));

      for (const file of eventFiles) {
        const event = require(path.join(eventsDir, file));
        const eventName = path.basename(file, '.js');

        if (event.once) {
          client.once(eventName, (...args) => event.execute(...args));
        } else {
          client.on(eventName, (...args) => event.execute(...args));
        }

        log.info(`Loaded event: ${eventName}`);
      }

      log.info(`Loaded ${eventFiles.length} events`);
    } catch (eventsError) {
      log.error('Error loading events:', { error: eventsError.message });
      throw new Error(`Event loading failed: ${eventsError.message}`);
    }

    // Step 4: Login to Discord
    try {
      log.info('Logging in to Discord...');
      await client.login(process.env.DISCORD_TOKEN);
      log.info(`Logged in as ${client.user.tag}`);
    } catch (loginError) {
      log.error('Discord login error:', { error: loginError.message });
      throw new Error(`Discord login failed: ${loginError.message}`);
    }

    // Memory check after basic initialization
    logMemoryUsage();

    // Step 5: Start tracking services one by one
    try {
      // Test API connection
      log.info('Testing API connection before starting services...');
      const clashApiService = require('./services/clashApiService');
      const apiConnectionSuccess = await clashApiService.testConnection();

      if (!apiConnectionSuccess) {
        log.warn('API connection test failed. Services may not function correctly.');

        if (process.env.PROXY_HOST) {
          log.warn('Please check your proxy configuration in .env file');
        } else {
          log.warn('Consider configuring a proxy in .env file for more reliable API access');
        }
      } else {
        log.info('API connection test successful');
      }

      // Start War tracking service with reduced cache
      log.info('Starting War tracking service...');
      const warTrackingService = require('./services/warTrackingService');
      await warTrackingService.startWarMonitoring();
      log.info('War tracking service started');
      logMemoryUsage();

      // Brief pause to allow stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start CWL tracking service
      log.info('Starting CWL tracking service...');
      const cwlTrackingService = require('./services/cwlTrackingService');
      await cwlTrackingService.startCWLMonitoring();
      log.info('CWL tracking service started');
      logMemoryUsage();

      // Brief pause to allow stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start Capital tracking service
      log.info('Starting Capital tracking service...');
      const capitalTrackingService = require('./services/capitalTrackingService');
      await capitalTrackingService.startCapitalMonitoring();
      log.info('Capital tracking service started');
    } catch (trackingError) {
      log.error('Error starting tracking services:', { error: trackingError.message });
      log.warn('Bot will continue running without some tracking services');
      // Don't throw here - let the bot continue even if some services fail
    }

    log.info('Bot started successfully!');
    logMemoryUsage();
  } catch (error) {
    log.error('Failed to start bot:', { error: error.stack || error.message || error });
    logMemoryUsage();
    process.exit(1);
  }
}

// Helper function to get all files in directory recursively
function getFiles(dir) {
  const files = [];

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      files.push(...getFiles(itemPath));
    } else {
      files.push(itemPath);
    }
  }

  return files;
}

// Start the bot
initializeBot();