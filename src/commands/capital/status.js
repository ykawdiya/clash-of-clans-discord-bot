// src/commands/capital/status.js
const { SlashCommandBuilder } = require('discord.js');
const { Clan, User, CapitalTracking } = require('../../models');
const { userPermission } = require('../../utils/permissions');
const capitalTrackingService = require('../../services/capitalTrackingService');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('View Clan Capital status and progress'),

  async execute(interaction) {
    try {
      // Get the clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });

      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }

      // Defer reply since this might take some time
      await interaction.deferReply();

      // Generate and send capital status embed
      const statusEmbed = await capitalTrackingService.generateCapitalStatusEmbed(clan.clanTag);

      return interaction.editReply({
        embeds: [statusEmbed]
      });
    } catch (error) {
      console.error('Error executing capital status command:', error);

      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while processing your request. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while processing your request. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};