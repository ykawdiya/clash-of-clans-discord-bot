// src/commands/capital.js (Revised to use only available API data)
const { SlashCommandBuilder } = require('discord.js');
const capitalStatusCommand = require('./capital/status');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('capital')
      .setDescription('Clan Capital commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('status')
              .setDescription('View Clan Capital status')),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Route to appropriate command handler based on subcommand
      if (subcommand === 'status') {
        return await capitalStatusCommand.execute(interaction);
      } else {
        return interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Error executing capital command:', error);
      return interaction.reply({
        content: 'An error occurred while processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};