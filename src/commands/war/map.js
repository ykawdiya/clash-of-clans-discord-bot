// src/commands/war/map.js
const warTrackingService = require('../../services/warTrackingService');
const { Clan, User } = require('../../models');
const { command: log } = require('../../utils/logger');
const {SlashCommandBuilder} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
      .setName('war__map')
      .setDescription('Show the war map with calls'),
      // Double underscore to avoid conflicts; this is meant to be used as a subcommand
  
  async execute(interaction) {
    try {
      // Get clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });
      
      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }
      
      // Defer reply as this might take time
      await interaction.deferReply();
      
      // Get war status
      const warStatus = await warTrackingService.getWarStatus(clan.clanTag);
      
      if (!warStatus.inWar) {
        return interaction.editReply({
          content: 'The clan is not currently in a war.'
        });
      }
      
      // Generate war map embed
      const warMapEmbed = await warTrackingService.generateWarMapEmbed(clan.clanTag);
      
      // Add instructions based on war state
      const warData = warStatus.data;
      let instructions = '';
      
      if (warData.state === 'preparation') {
        instructions = 'Preparation Day: Use `/war call` to reserve bases for your attacks.';
      } else if (warData.state === 'inWar') {
        instructions = 'Battle Day: Attack your assigned targets. Good luck!';
      } else {
        instructions = 'War has ended. Check `/war stats` for performance summary.';
      }
      
      await interaction.editReply({
        content: instructions,
        embeds: [warMapEmbed]
      });
    } catch (error) {
      log.error('Error executing war map command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting the war map. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting the war map. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};
