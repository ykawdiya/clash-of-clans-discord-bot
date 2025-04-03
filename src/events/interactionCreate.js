// src/events/interactionCreate.js (Fixed)
const { InteractionType } = require('discord.js');
const { command: log } = require('../utils/logger');

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
            content: 'This command is not available. Try using /help to see available commands.',
            ephemeral: true
          });
        }

        // Execute command with error handling
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
            // Safe reply that won't cause "already acknowledged" errors
            await interaction.reply({
              content: 'An error occurred while executing this command.',
              ephemeral: true
            }).catch(() => {
              // If this fails too, the interaction might have timed out
              log.error(`Failed to reply to interaction for command ${interaction.commandName}`);
            });
          } else if (interaction.deferred && !interaction.replied) {
            // If interaction was deferred but not replied yet
            await interaction.editReply({
              content: 'An error occurred while executing this command.'
            }).catch(() => {
              log.error(`Failed to edit deferred reply for command ${interaction.commandName}`);
            });
          }
        }
      }
    } catch (error) {
      log.error('Error handling interaction:', { error: error.stack || error.message });
    }
  }
};