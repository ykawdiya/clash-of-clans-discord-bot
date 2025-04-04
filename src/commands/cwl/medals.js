// src/commands/cwl/medals.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { Clan, User, CWLTracking } = require('../../models');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('medals')
      .setDescription('View CWL medal calculator and rewards'),

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

      // Create medals embed
      const embed = new EmbedBuilder()
          .setTitle('CWL Medal Calculator')
          .setDescription(`Clan War League medal rewards are based on your league and final position.`)
          .setColor('#9b59b6');

      // Add medal table based on tiers
      const medalTable = this.getCWLMedalTable();

      // Display medals by league tiers for better readability
      // Champions
      const champLeagueFields = this.formatLeagueTier(
        medalTable, 
        ['Champion League I', 'Champion League II', 'Champion League III'],
        '👑 Champion Leagues'
      );
      
      // Master
      const masterLeagueFields = this.formatLeagueTier(
        medalTable,
        ['Master League I', 'Master League II', 'Master League III'],
        '🔶 Master Leagues'  
      );
      
      // Crystal
      const crystalLeagueFields = this.formatLeagueTier(
        medalTable,
        ['Crystal League I', 'Crystal League II', 'Crystal League III'],
        '💎 Crystal Leagues'
      );
      
      // Gold, Silver, Bronze in one table to save space
      const goldLeagueFields = this.formatLeagueTier(
        medalTable,
        ['Gold League I', 'Gold League II', 'Gold League III'],
        '🥇 Gold Leagues'
      );
      
      const silverLeagueFields = this.formatLeagueTier(
        medalTable,
        ['Silver League I', 'Silver League II', 'Silver League III'],
        '🥈 Silver Leagues'
      );
      
      const bronzeLeagueFields = this.formatLeagueTier(
        medalTable,
        ['Bronze League I', 'Bronze League II', 'Bronze League III'],
        '🥉 Bronze Leagues'
      );
      
      // Add the formatted fields to the embed
      champLeagueFields.forEach(field => embed.addFields(field));
      masterLeagueFields.forEach(field => embed.addFields(field));
      crystalLeagueFields.forEach(field => embed.addFields(field));
      goldLeagueFields.forEach(field => embed.addFields(field));
      silverLeagueFields.forEach(field => embed.addFields(field));
      bronzeLeagueFields.forEach(field => embed.addFields(field));

      // Get active CWL season
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });

      if (cwlTracking) {
        // Calculate estimated position
        const warWins = cwlTracking.warDays.filter(day => day.outcome === 'win').length;
        const totalWars = cwlTracking.warDays.filter(day => day.outcome !== 'ongoing').length;

        // Rough estimate of position based on wins
        let estimatedPosition = 0;
        if (totalWars > 0) {
          // This is a very rough estimate that doesn't account for ties or star differences
          estimatedPosition = 8 - Math.round(warWins * 7 / totalWars);
          if (estimatedPosition < 1) estimatedPosition = 1;
          if (estimatedPosition > 8) estimatedPosition = 8;
        }

        // Calculate estimated medals
        const league = cwlTracking.league;
        let estimatedMedals = 0;

        if (league && medalTable[league] && estimatedPosition > 0) {
          estimatedMedals = medalTable[league][estimatedPosition - 1];
        }

        // Add current CWL info
        if (cwlTracking.currentDay > 0) {
          let statusText = '';

          statusText += `**Season**: ${cwlTracking.season}\n`;
          statusText += `**League**: ${cwlTracking.league}\n`;
          statusText += `**War Day**: ${cwlTracking.currentDay}/7\n`;
          statusText += `**War Wins**: ${warWins}/${totalWars}\n`;

          if (estimatedPosition > 0) {
            statusText += `**Estimated Position**: ${estimatedPosition}/8\n`;
            statusText += `**Estimated Medals**: ${estimatedMedals}`;
          }

          embed.addFields({
            name: 'Current CWL Status',
            value: statusText
          });
        }
      }

      // Simplify explanatory notes
      embed.addFields({
        name: 'Medal Distribution',
        value: 'Participated in wars: **100%** of medals\nIn roster but didn\'t participate: **20%** of medals'
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error executing cwl medals command:', { error: error.message });

      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while displaying medal calculator. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while displaying medal calculator. Please try again later.',
          ephemeral: true
        });
      }
    }
  },

  /**
   * Get CWL medal rewards by league and position
   * @returns {Object} - Medal table
   */
  getCWLMedalTable() {
    return {
      'Bronze League III': [25, 20, 16, 12, 8, 6, 4, 2],
      'Bronze League II': [35, 30, 22, 18, 14, 10, 6, 2],
      'Bronze League I': [45, 40, 30, 25, 20, 14, 8, 2],
      'Silver League III': [55, 50, 40, 30, 25, 18, 10, 2],
      'Silver League II': [70, 60, 50, 40, 30, 22, 14, 6],
      'Silver League I': [85, 75, 65, 50, 35, 25, 18, 10],
      'Gold League III': [100, 90, 75, 60, 45, 35, 25, 15],
      'Gold League II': [120, 110, 90, 75, 60, 45, 30, 20],
      'Gold League I': [140, 130, 110, 90, 75, 60, 40, 25],
      'Crystal League III': [170, 150, 135, 120, 95, 75, 55, 35],
      'Crystal League II': [190, 170, 150, 135, 110, 90, 70, 45],
      'Crystal League I': [210, 190, 170, 150, 125, 100, 80, 55],
      'Master League III': [240, 220, 200, 180, 160, 140, 120, 100],
      'Master League II': [260, 240, 220, 200, 180, 160, 140, 120],
      'Master League I': [280, 260, 240, 220, 200, 180, 160, 140],
      'Champion League III': [300, 280, 260, 240, 220, 200, 180, 160],
      'Champion League II': [320, 300, 280, 260, 240, 220, 200, 180],
      'Champion League I': [340, 320, 300, 280, 260, 240, 220, 200]
    };
  },
  
  /**
   * Format a tier of leagues into embed fields
   * @param {Object} medalTable - The medal table
   * @param {Array} leagues - Array of league names
   * @param {String} title - Title for the group
   * @returns {Array} - Array of embed fields
   */
  formatLeagueTier(medalTable, leagues, title) {
    // Create a single field with all leagues in this tier
    let content = `**${title}**\n`;
    
    for (const league of leagues) {
      if (medalTable[league]) {
        const medals = medalTable[league];
        
        // Just show top 3 and bottom positions to save space
        content += `**${league}**\n`;
        content += `1st: ${medals[0]} | 2nd: ${medals[1]} | 3rd: ${medals[2]} medals\n`;
      }
    }
    
    // Return as a single field to save space
    return [{ name: title, value: content, inline: false }];
  }
};