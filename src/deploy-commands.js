// src/deploy-commands.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { system: log } = require('./utils/logger');

const clientId = process.env.CLIENT_ID;
const token = process.env.DISCORD_TOKEN;

// Function to find all command files recursively
const getFiles = (dir) => {
  const files = [];

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      files.push(...getFiles(itemPath));
    } else if (item.name.endsWith('.js')) {
      files.push(itemPath);
    }
  }

  return files;
};

async function deployCommands() {
  try {
    log.info('Starting command deployment...');

    // Find all command files
    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = getFiles(commandsDir);

    // Global commands array to register
    const globalCommands = [];

    // Process each command file
    for (const filePath of commandFiles) {
      try {
        const command = require(filePath);

        // Skip files without data property
        if (!command.data) {
          continue;
        }

        // Skip subcommand files (those in subdirectories)
        const relativeFilePath = path.relative(commandsDir, filePath);
        if (relativeFilePath.includes(path.sep) && !filePath.includes('admin')) {
          // Skip files in subdirectories (except admin commands)
          continue;
        }

        try {
          // Safely check if toJSON exists and is a function
          if (!command.data || typeof command.data.toJSON !== 'function') {
            log.warn(`Command ${path.basename(filePath)} missing valid toJSON method, skipping`);
            continue;
          }

          // Get JSON data for command
          const commandJSON = command.data.toJSON();
          globalCommands.push(commandJSON);

          // Log added command
          log.info(`Added command: ${commandJSON.name}`);
        } catch (error) {
          log.error(`Error processing command data in ${filePath}:`, { error: error.message });
        }
      } catch (error) {
        log.error(`Error loading command file ${filePath}:`, { error: error.message });
      }
    }

    if (globalCommands.length === 0) {
      log.error('No valid commands found to deploy');
      return;
    }

    // Create REST instance
    const rest = new REST({ version: '9' }).setToken(token);

    // Deploy commands
    log.info(`Deploying ${globalCommands.length} commands...`);

    // Deploy global commands
    const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: globalCommands }
    );

    log.info(`Successfully deployed ${data.length} commands!`);
  } catch (error) {
    log.error('Error deploying commands:', { error: error.message });
  }
}

deployCommands();