// src/commands/capital/raids.js
const { SlashCommandBuilder } = require('discord.js');
const capitalTrackingService = require('../../services/capitalTrackingService');
const { Clan, User } = require('../../models');
const { userPermission } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raids')
    .setDescription('View Clan Capital Raid Weekend status')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the current Raid Weekend status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('View historical Raid Weekend results')),
  
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
      
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'status') {
        // Generate and send raid weekend status embed
        const statusEmbed = await capitalTrackingService.generateRaidWeekendStatusEmbed(clan.clanTag);
        
        return interaction.editReply({
          embeds: [statusEmbed]
        });
      } else if (subcommand === 'history') {
        // Get capital status
        const { success, status, message } = await capitalTrackingService.getCapitalStatus(clan.clanTag);
        
        if (!success) {
          return interaction.editReply({
            content: message || 'Could not retrieve Raid Weekend history.'
          });
        }
        
        // Check if we have raid weekend history
        if (!status.raidWeekends || status.raidWeekends.length === 0) {
          return interaction.editReply({
            content: 'No Raid Weekend history available for this clan.'
          });
        }
        
        // Generate and send raid weekend history embed
        const historyEmbed = await capitalTrackingService.generateRaidWeekendStatusEmbed(clan.clanTag);
        
        return interaction.editReply({
          embeds: [historyEmbed]
        });
      }
    } catch (error) {
      console.error('Error executing capital raids command:', error);
      
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
