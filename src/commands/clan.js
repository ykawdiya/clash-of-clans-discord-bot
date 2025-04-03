// src/commands/clan.js (Simplified)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('clan')
      .setDescription('Clan information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('Get basic clan information'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('link')
              .setDescription('Link a clan to this server')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag')
                      .setRequired(true))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'info') {
        // Simple info response
        await interaction.reply({
          content: 'This is a simple clan info command. The full functionality will be available soon.',
          ephemeral: false
        });
      }
      else if (subcommand === 'link') {
        const tag = interaction.options.getString('tag');
        await interaction.reply({
          content: `Linking clan with tag: ${tag}. Full functionality will be available soon.`,
          ephemeral: false
        });
      }
      else {
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
      }
    } catch (error) {
      log.error('Error executing clan command:', { error: error.message });

      // Only attempt to reply if no reply has been sent yet
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        }).catch(e => {
          log.error(`Failed to send error response:`, { error: e.message });
        });
      }
    }
  }
};