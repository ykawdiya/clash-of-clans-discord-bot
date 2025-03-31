// src/commands/cwl/stats.js
const cwlTrackingService = require('../../services/cwlTrackingService');
const Clan = require('../../models/Clan');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: {
    name: 'stats',
    description: 'Show CWL statistics'
  },
  
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
      
      // View CWL stats
      const result = await cwlTrackingService.viewCWLStats(interaction, clan.clanTag);
      
      if (!result || !result.success) {
        return interaction.editReply({
          content: result?.message || 'No CWL history found for this clan.'
        });
      }
      
      return interaction.editReply({
        embeds: [result.embed]
      });
    } catch (error) {
      log.error('Error executing cwl stats command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting CWL statistics. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting CWL statistics. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};
