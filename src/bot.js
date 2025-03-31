// src/bot.js
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { system: log } = require('./utils/logger');
const warTrackingService = require('./services/warTrackingService');
const cwlTrackingService = require('./services/cwlTrackingService');
const capitalTrackingService = require('./services/capitalTrackingService');

class ClashBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.client.commands = new Collection();

    // Make client globally accessible
    global.client = this.client;
  }

  /**
   * Initialize the bot
   */
  async init() {
    try {
      // Connect to MongoDB
      await this.connectDatabase();

      // Load commands
      await this.loadCommands();

      // Load events
      await this.loadEvents();

      // Test API connection
      log.info('Testing API connection before starting services...');
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

      // Start tracking services
      await this.startTrackingServices();

      // Login to Discord
      await this.client.login(process.env.DISCORD_TOKEN);

      log.info('Bot initialized successfully');
    } catch (error) {
      log.error('Error initializing bot:', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Connect to MongoDB database
   */
  async connectDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      log.info('Connected to MongoDB successfully');
    } catch (error) {
      log.error('Error connecting to MongoDB:', { error: error.message });
      throw error;
    }
  }

  /**
   * Load commands from commands directory
   */
  async loadCommands() {
    try {
      const commandsPath = path.join(__dirname, 'commands');
      const commandFiles = this.getFiles(commandsPath).filter(file => file.endsWith('.js'));

      for (const file of commandFiles) {
        const command = require(file);

        // Set a name for the command
        const commandName = command.data?.name || path.basename(file, '.js');

        // Add command to collection
        this.client.commands.set(commandName, command);

        log.info(`Loaded command: ${commandName}`);
      }

      log.info(`Loaded ${this.client.commands.size} commands`);
    } catch (error) {
      log.error('Error loading commands:', { error: error.message });
      throw error;
    }
  }

  /**
   * Load events from events directory
   */
  async loadEvents() {
    try {
      const eventsPath = path.join(__dirname, 'events');
      const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

      for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        const eventName = path.basename(file, '.js');

        if (event.once) {
          this.client.once(eventName, (...args) => event.execute(...args));
        } else {
          this.client.on(eventName, (...args) => event.execute(...args));
        }

        log.info(`Loaded event: ${eventName}`);
      }

      log.info(`Loaded ${eventFiles.length} events`);
    } catch (error) {
      log.error('Error loading events:', { error: error.message });
      throw error;
    }
  }

  /**
   * Start all tracking services
   */
  async startTrackingServices() {
    try {
      // Start War tracking service
      await warTrackingService.startWarMonitoring();
      log.info('Started War tracking service');

      // Start CWL tracking service
      await cwlTrackingService.startCWLMonitoring();
      log.info('Started CWL tracking service');

      // Start Capital tracking service
      await capitalTrackingService.startCapitalMonitoring();
      log.info('Started Capital tracking service');
    } catch (error) {
      log.error('Error starting tracking services:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all files in directory recursively
   * @param {String} dir - Directory path
   * @returns {Array} - Array of file paths
   */
  getFiles(dir) {
    const files = [];

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        files.push(...this.getFiles(itemPath));
      } else {
        files.push(itemPath);
      }
    }

    return files;
  }
}

module.exports = new ClashBot();