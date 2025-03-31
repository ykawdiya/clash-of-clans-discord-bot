// src/events/interactionCreate.js
const { InteractionType } = require('discord.js');
const { command: log } = require('../utils/logger');
const { permissionMiddleware } = require('../utils/permissions');

// Define channel-command permissions
const commandChannelPermissions = {
  "war-status": {
    allowedCommands: ["war status", "war stats"],
    allowedRoles: ["@everyone"]
  },
  "war-planning": {
    allowedCommands: ["war plan", "war matchup"],
    allowedRoles: ["Elder", "Co-Leader", "Leader"]
  },
  "base-calling": {
    allowedCommands: ["war call", "war scout"],
    allowedRoles: ["Member", "Elder", "Co-Leader", "Leader"]
  },
  "cwl-roster": {
    allowedCommands: ["cwl roster"],
    allowedRoles: ["Elder", "Co-Leader", "Leader"]
  },
  "cwl-announcements": {
    allowedCommands: ["cwl status", "cwl stats"],
    allowedRoles: ["@everyone"]
  },
  "capital-status": {
    allowedCommands: ["capital status"],
    allowedRoles: ["@everyone"]
  },
  "raid-weekends": {
    allowedCommands: ["capital raids"],
    allowedRoles: ["@everyone"]
  },
  "contribution-tracker": {
    allowedCommands: ["capital contribute"],
    allowedRoles: ["Member", "Elder", "Co-Leader", "Leader"]
  },
  "upgrade-planning": {
    allowedCommands: ["capital planner"],
    allowedRoles: ["Co-Leader", "Leader"]
  }
};

// Create permission middleware
const checkPermission = permissionMiddleware(commandChannelPermissions);

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // Handle command interactions
      if (interaction.type === InteractionType.ApplicationCommand) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
          log.warn(`Command ${interaction.commandName} not found`);
          return interaction.reply({
            content: 'Something went wrong while executing this command.',
            ephemeral: true
          });
        }

        // Check permissions for certain commands, but don't block execution if there's an error
        try {
          const { allowed, message } = await checkPermission(interaction);

          if (!allowed) {
            return interaction.reply({
              content: message,
              ephemeral: true
            });
          }
        } catch (error) {
          log.error(`Error checking permissions for ${interaction.commandName}:`, {
            error: error.stack || error.message
          });
          // Continue execution even if permission check fails
        }

        // Execute command
        log.info(`Executing command ${interaction.commandName}`, {
          user: interaction.user.tag,
          guild: interaction.guild?.name || 'DM'
        });

        try {
          await command.execute(interaction);
        } catch (error) {
          log.error(`Error executing command ${interaction.commandName}:`, {
            error: error.stack || error.message
          });

          // Send error response if not already replied
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while executing this command.',
              ephemeral: true
            });
          } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({
              content: 'An error occurred while executing this command.'
            });
          }
        }
      }
    } catch (error) {
      log.error('Error handling interaction:', { error: error.stack || error.message });
    }
  }
};