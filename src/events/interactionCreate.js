// src/events/interactionCreate.js (Simplified)
const { InteractionType } = require('discord.js');
const { command: log } = require('../utils/logger');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // Only handle command interactions
      if (interaction.type === InteractionType.ApplicationCommand) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
          log.warn(`Command ${interaction.commandName} not found`);
          return interaction.reply({
            content: 'This command is not available. Try using /help to see available commands.',
            ephemeral: true
          }).catch(e => {
            log.error(`Failed to reply: ${e.message}`);
          });
        }

        // Log the command execution attempt
        log.info(`Executing command ${interaction.commandName}`, {
          user: interaction.user.tag,
          guild: interaction.guild?.name || 'DM'
        });

        // Simple error handling wrapper
        try {
          await command.execute(interaction);
        } catch (error) {
          log.error(`Error executing command ${interaction.commandName}:`, {
            error: error.stack || error.message
          });

          // Only try to respond if the interaction hasn't been handled yet
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while executing this command.',
              ephemeral: true
            }).catch(() => {});
          }
        }
      }
    } catch (error) {
      log.error('Error handling interaction:', { error: error.stack || error.message });
    }
  }
};