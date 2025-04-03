// src/index.js - Updated command loading
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

// Initialize bot
async function initializeBot() {
  try {
    log.info('Starting Clash of Clans Discord Bot with debug monitoring...');

    // Set up memory logging interval
    const memoryInterval = setInterval(logMemoryUsage, 60000); // Every minute

    // Initial memory usage
    logMemoryUsage();

    // Create Discord client
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

    // Step 1: Connect to MongoDB first
    try {
      log.info('Connecting to MongoDB...');
      log.info(`Connection string: ${process.env.MONGODB_URI.replace(/\/\/(.+?):(.+?)@/, '//[username]:[password]@')}`);

      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      log.info('Connected to MongoDB successfully');
    } catch (mongoError) {
      log.error('MongoDB connection error:', { error: mongoError.message, stack: mongoError.stack });
      throw new Error(`MongoDB connection failed: ${mongoError.message}`);
    }

    // Step 2: Now load commands after DB connection
    try {
      log.info('Loading commands...');

      // FIXED: Load all command files including subdirectories
      const commandsDir = path.join(__dirname, 'commands');
      
      // Function to recursively load commands from directories
      function loadCommandsRecursively(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        let commandCount = 0;
        
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            // Recursively process subdirectories
            commandCount += loadCommandsRecursively(itemPath);
          } else if (item.name.endsWith('.js')) {
            try {
              const command = require(itemPath);
              
              if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                log.info(`Loaded command: ${command.data.name}`);
                commandCount++;
              } else {
                log.warn(`Command at ${itemPath} is missing required "data" or "execute" properties`);
              }
            } catch (error) {
              log.error(`Error loading command file ${itemPath}:`, { error: error.message, stack: error.stack });
            }
          }
        }
        
        return commandCount;
      }
      
      const commandCount = loadCommandsRecursively(commandsDir);
      log.info(`Found and loaded ${commandCount} command files (including subdirectories)`);

      log.info(`Loaded ${client.commands.size} commands`);
    } catch (commandsError) {
      log.error('Error loading commands:', { error: commandsError.message, stack: commandsError.stack });
      throw new Error(`Command loading failed: ${commandsError.message}`);
    }

    // Step 3: Load events
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
      log.error('Error loading events:', { error: eventsError.message, stack: eventsError.stack });
      throw new Error(`Event loading failed: ${eventsError.message}`);
    }

    // Step 4: Login to Discord AFTER everything is loaded
    try {
      log.info('Logging in to Discord...');
      await client.login(process.env.DISCORD_TOKEN);
      log.info(`Logged in as ${client.user.tag}`);
    } catch (loginError) {
      log.error('Discord login error:', { error: loginError.message, stack: loginError.stack });
      throw new Error(`Discord login failed: ${loginError.message}`);
    }

    // Memory check after initialization
    logMemoryUsage();

    // Step 5: Start tracking services with error handling
    log.info('Starting tracking services...');
    
    try {
      // Test API connection
      log.info('Testing API connection before starting services...');
      const clashApiService = require('./services/clashApiService');
      const apiConnectionSuccess = await clashApiService.testConnection();

      if (!apiConnectionSuccess) {
        log.warn('API connection test failed. Proceeding with limited functionality.');
      } else {
        log.info('API connection test successful');

        // Start services - uncomment these as needed
        /*
        try {
          log.info('Starting War tracking service...');
          const warTrackingService = require('./services/warTrackingService');
          await warTrackingService.startWarMonitoring();
          log.info('War tracking service started');
        } catch (serviceError) {
          log.error('Failed to start War tracking service:', { error: serviceError.message });
        }

        try {
          log.info('Starting CWL tracking service...');
          const cwlTrackingService = require('./services/cwlTrackingService');
          await cwlTrackingService.startCWLMonitoring();
          log.info('CWL tracking service started');
        } catch (serviceError) {
          log.error('Failed to start CWL tracking service:', { error: serviceError.message });
        }

        try {
          log.info('Starting Capital tracking service...');
          const capitalTrackingService = require('./services/capitalTrackingService');
          await capitalTrackingService.startCapitalMonitoring();
          log.info('Capital tracking service started');
        } catch (serviceError) {
          log.error('Failed to start Capital tracking service:', { error: serviceError.message });
        }
        */
      }
    } catch (error) {
      log.error('Error initializing tracking services:', { error: error.message });
      log.warn('Bot will continue with limited functionality');
    }

    // Comment out the tracking service initialization during initial troubleshooting
    /*
    try {
      // Test API connection
      log.info('Testing API connection before starting services...');
      const clashApiService = require('./services/clashApiService');
      const apiConnectionSuccess = await clashApiService.testConnection();

      if (!apiConnectionSuccess) {
        log.warn('API connection test failed. Proceeding with limited functionality.');
      } else {
        log.info('API connection test successful');

        // Start services
        try {
          log.info('Starting War tracking service...');
          const warTrackingService = require('./services/warTrackingService');
          await warTrackingService.startWarMonitoring();
          log.info('War tracking service started');
        } catch (serviceError) {
          log.error('Failed to start War tracking service:', { error: serviceError.message });
        }

        try {
          log.info('Starting CWL tracking service...');
          const cwlTrackingService = require('./services/cwlTrackingService');
          await cwlTrackingService.startCWLMonitoring();
          log.info('CWL tracking service started');
        } catch (serviceError) {
          log.error('Failed to start CWL tracking service:', { error: serviceError.message });
        }

        try {
          log.info('Starting Capital tracking service...');
          const capitalTrackingService = require('./services/capitalTrackingService');
          await capitalTrackingService.startCapitalMonitoring();
          log.info('Capital tracking service started');
        } catch (serviceError) {
          log.error('Failed to start Capital tracking service:', { error: serviceError.message });
        }
      }
    } catch (error) {
      log.error('Error initializing tracking services:', { error: error.message });
      log.warn('Bot will continue with limited functionality');
    }
    */

    log.info('Bot started successfully in minimal mode!');
    log.info('Try using /help or /ping commands to test functionality');
    logMemoryUsage();
  } catch (error) {
    log.error('Failed to start bot:', { error: error.stack || error.message || error });
    logMemoryUsage();
    process.exit(1);
  }
}

// Start the bot
initializeBot();