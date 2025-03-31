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

        // Skip if command doesn't have data (for subcommands)
        if (!command.data) {
          const filename = path.basename(filePath);
          if (!filename.includes('/')) { // Only log for top-level files
            log.warn(`Command file ${filename} doesn't have a data property, skipping`);
          }
          continue;
        }

        // Skip subcommand files (those in subdirectories)
        const relativeFilePath = path.relative(commandsDir, filePath);
        if (relativeFilePath.includes(path.sep) && !filePath.includes('admin')) {
          // Skip files in subdirectories (except admin commands)
          continue;
        }

        // Check if data has toJSON method
        if (typeof command.data.toJSON === 'function') {
          // Add to global commands
          globalCommands.push(command.data.toJSON());
          log.info(`Added command: ${command.data.name}`);
        } else {
          log.warn(`Command file ${path.basename(filePath)} doesn't have a data.toJSON function, skipping`);
        }
      } catch (error) {
        log.error(`Error loading command file ${filePath}:`, { error: error.message });
      }
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