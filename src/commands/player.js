// src/commands/player.js (Simplified)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('player')
      .setDescription('Player information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('View player information')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag (optional)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('link')
              .setDescription('Link your Clash of Clans account')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag')
                      .setRequired(true))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'info') {
        const tag = interaction.options.getString('tag') || 'Your linked account';
        await interaction.reply({
          content: `Player info for tag: ${tag}. Full functionality will be available soon.`,
          ephemeral: false
        });
      }
      else if (subcommand === 'link') {
        const tag = interaction.options.getString('tag');
        await interaction.reply({
          content: `Linking player account with tag: ${tag}. Full functionality will be available soon.`,
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
      log.error('Error executing player command:', { error: error.message });

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