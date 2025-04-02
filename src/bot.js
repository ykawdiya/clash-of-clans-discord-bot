// src/bot.js (modified for debugging)
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { system: log } = require('./utils/logger');

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
    global.client = this.client;
  }

  /**
   * Initialize the bot
   */
  async init() {
    try {
      // Step 1: Connect to MongoDB
      log.info('Connecting to MongoDB...');
      await this.connectDatabase();
      log.info('MongoDB connection successful');

      // Step 2: Load commands - simplified for testing
      log.info('Loading commands...');
      await this.loadCommands();
      log.info(`Loaded ${this.client.commands.size} commands`);

      // Step 3: Load events
      log.info('Loading events...');
      await this.loadEvents();
      log.info('Events loaded successfully');

      // Step 4: Login to Discord - do this first before starting services
      log.info('Logging into Discord...');
      await this.client.login(process.env.DISCORD_TOKEN);
      log.info(`Logged in as ${this.client.user.tag}`);

      // Step 5: Skip starting tracking services for initial testing
      log.info('Skipping tracking services for initial testing');
      log.warn('Tracking services are DISABLED for debugging');

      /*
      // We'll enable these later after fixing initial issues
      log.info('Starting tracking services...');
      await this.startTrackingServices();
      log.info('Tracking services started');
      */

      log.info('Bot initialization complete');
    } catch (error) {
      log.error('Error initializing bot:', { error: error.message });
      throw error;
    }
  }

  // [Rest of your methods remain the same]
}

module.exports = ClashBot;