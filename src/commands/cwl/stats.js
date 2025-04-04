// src/commands/cwl/stats.js
const cwlTrackingService = require('../../services/cwlTrackingService');
const { Clan, User } = require('../../models');
const clashApiService = require('../../services/clashApiService');
const CWLTracking = require('../../models/CWLTracking');
const { command: log } = require('../../utils/logger');
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Show CWL statistics'),

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
      
      // Try to get current CWL group data from API first
      try {
        log.info(`Trying to get CWL data for ${clan.clanTag} from API`);
        const cwlGroup = await clashApiService.getCWLGroup(clan.clanTag);
        
        if (cwlGroup && cwlGroup.clans) {
          // We have API data, create a rich embed with it
          return await this.handleAPIStats(interaction, clan, cwlGroup);
        }
      } catch (apiError) {
        log.warn(`Could not get CWL API data: ${apiError.message}. Falling back to database.`);
      }
      
      // Fall back to database if API doesn't provide data
      // View CWL stats from database
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
  },
  
  async handleAPIStats(interaction, clan, cwlGroup) {
    try {
      // Create an embed with essential CWL information
      const embed = new EmbedBuilder()
        .setTitle(`CWL Status - ${clan.name}`)
        .setColor('#9b59b6');
        
      // Basic season info
      const seasonInfo = [`League: ${cwlGroup.state || 'Active'}`];
      if (cwlGroup.season) {
        seasonInfo.push(`Season: ${cwlGroup.season}`);
      }
      embed.setDescription(seasonInfo.join(' • '));
      
      // Process current/recent wars - focus on results
      if (cwlGroup.rounds) {
        const wars = [];
        
        // Check each round for war data
        for (const round of cwlGroup.rounds) {
          if (round.warTags) {
            for (const warTag of round.warTags) {
              if (warTag !== '#0') {
                try {
                  const warData = await clashApiService.getCWLWar(warTag);
                  if (warData && 
                     (warData.clan.tag === clan.clanTag || warData.opponent.tag === clan.clanTag)) {
                    wars.push(warData);
                  }
                } catch (error) {
                  // Silently skip failed war data 
                }
              }
            }
          }
        }
        
        // If we found wars, show a simplified war summary
        if (wars.length > 0) {
          let warSummary = '';
          let wins = 0, losses = 0, ongoing = 0;
          
          for (const war of wars) {
            // Determine if we're clan or opponent
            const isOurClanAttacking = war.clan.tag === clan.clanTag;
            const ourClanData = isOurClanAttacking ? war.clan : war.opponent;
            const opponentData = isOurClanAttacking ? war.opponent : war.clan;
            
            // Determine result if available
            if (war.state === 'warEnded') {
              const didWin = ourClanData.stars > opponentData.stars || 
                (ourClanData.stars === opponentData.stars && 
                 ourClanData.destructionPercentage > opponentData.destructionPercentage);
                 
              if (didWin) {
                warSummary += `✅ vs ${opponentData.name}: ${ourClanData.stars}⭐\n`;
                wins++;
              } else {
                warSummary += `❌ vs ${opponentData.name}: ${ourClanData.stars}⭐\n`;
                losses++;
              }
            } else if (war.state === 'inWar') {
              warSummary += `⚔️ vs ${opponentData.name}: ${ourClanData.stars}⭐ (in progress)\n`;
              ongoing++;
            }
          }
          
          // Add summary stats at the top
          embed.addFields(
            { name: 'Current Record', value: `${wins} wins, ${losses} losses, ${ongoing} ongoing`, inline: false },
            { name: 'Matches', value: warSummary || 'No completed matches yet' }
          );
        } else {
          embed.addFields({ 
            name: 'Status', 
            value: 'CWL is active but no matches found yet. War pairings may still be determined.' 
          });
        }
      }
      
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error(`Error handling API stats: ${error.message}`);
      throw error;
    }
  }
};
