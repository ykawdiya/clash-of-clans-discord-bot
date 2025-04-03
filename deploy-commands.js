// src/deploy-commands.js (fixed)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { system: log } = require('./src/utils/logger');

// Configuration
const clientId = process.env.CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID; // Optional: for guild-specific commands

// FIXED: Only process root command files, not subcommands
const getCommandFiles = () => {
  const dir = path.join(__dirname, 'src/commands');
  const files = [];

  // Only get files in the root commands folder, not in subdirectories
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (!item.isDirectory() && item.name.endsWith('.js')) {
      files.push(path.join(dir, item.name));
    }
  }

  return files;
};

async function deployCommands() {
  try {
    log.info('Starting command deployment...');

    // Create REST instance
    const rest = new REST({ version: '9' }).setToken(token);

    // Initialize commands array
    const commands = [];
    const failedCommands = [];

    // Find command files in the commands directory (root level only)
    const commandFiles = getCommandFiles();

    log.info(`Found ${commandFiles.length} command files`);

    // Load each command
    for (const filePath of commandFiles) {
      try {
        const command = require(filePath);

        // Skip files without data property or toJSON method
        if (!command.data || typeof command.data.toJSON !== 'function') {
          const relativePath = path.relative(process.cwd(), filePath);
          log.error(`Command in ${relativePath} is missing proper SlashCommandBuilder structure`);
          continue;
        }

        commands.push(command.data.toJSON());
        log.info(`Added command: ${command.data.name}`);
      } catch (error) {
        const relativePath = path.relative(process.cwd(), filePath);
        log.error(`Error loading command file ${relativePath}:`, { error: error.message });
        failedCommands.push(filePath);
      }
    }

    log.info(`Deploying ${commands.length} commands...`);

    // Deploy commands
    if (guildId) {
      // Guild commands - update instantly but only for specific guild
      const data = await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commands }
      );
      log.info(`Successfully deployed ${data.length} guild commands!`);
    } else {
      // Global commands - update takes up to an hour but works in all guilds
      const data = await rest.put(
          Routes.applicationCommands(clientId),
          { body: commands }
      );
      log.info(`Successfully deployed ${data.length} global commands!`);
    }

    // Log failed commands
    if (failedCommands.length > 0) {
      log.warn(`${failedCommands.length} commands failed to load. Fix these files before deploying again.`);
    }
  } catch (error) {
    log.error('Error deploying commands:', { error: error.message });
  }
}

deployCommands();