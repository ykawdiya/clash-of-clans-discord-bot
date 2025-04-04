// src/commands/war/call.js
const { SlashCommandBuilder } = require('discord.js');
const warTrackingService = require('../../services/warTrackingService');
const { Clan, User, WarTracking } = require('../../models');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('war__call')
      .setDescription('Call a base in war') 
      // Double underscore to avoid conflicts; this is meant to be used as a subcommand
      .addIntegerOption(option =>
          option.setName('base')
              .setDescription('Base number to call')
              .setRequired(true))
      .addStringOption(option =>
          option.setName('note')
              .setDescription('Optional note about your attack plan')
              .setRequired(false)),

  async execute(interaction) {
    try {
      // Get required parameters
      const baseNumber = interaction.options.getInteger('base');
      const note = interaction.options.getString('note');

      // Get clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });

      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }

      // Handle base call
      const result = await warTrackingService.handleBaseCall(
          interaction,
          baseNumber,
          clan.clanTag,
          note
      );

      if (!result || !result.success) {
        return interaction.reply({
          content: result?.message || 'There was an error calling the base. Please try again later.',
          ephemeral: true
        });
      }

      // Get war map embed
      const warMapEmbed = await warTrackingService.generateWarMapEmbed(clan.clanTag);

      // If base was uncalled
      if (result.uncalled) {
        return interaction.reply({
          content: result.message,
          ephemeral: false
        });
      }

      // Send response with map
      return interaction.reply({
        content: result.message,
        embeds: [warMapEmbed],
        ephemeral: false
      });
    } catch (error) {
      log.error('Error executing war call command:', { error: error.message });
      return interaction.reply({
        content: 'An error occurred while calling the base. Please try again later.',
        ephemeral: true
      });
    }
  }
};