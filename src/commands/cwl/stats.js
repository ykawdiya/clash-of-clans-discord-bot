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
      // Create an embed with CWL group information
      const embed = new EmbedBuilder()
        .setTitle(`CWL Statistics - ${clan.name}`)
        .setDescription(`Current CWL Season Statistics`)
        .setColor('#9b59b6');
        
      // Add league information
      if (cwlGroup.season) {
        embed.addFields({ 
          name: 'Season', 
          value: cwlGroup.season 
        });
      }
      
      // Find our clan in the group
      const ourClan = cwlGroup.clans.find(c => c.tag === clan.clanTag);
      
      if (ourClan) {
        embed.addFields({ 
          name: 'Clan', 
          value: `${ourClan.name} (${ourClan.tag})`,
          inline: true 
        });
        
        if (ourClan.clanLevel) {
          embed.addFields({ 
            name: 'Clan Level', 
            value: ourClan.clanLevel.toString(),
            inline: true 
          });
        }
      }
      
      // Add group clans information
      if (cwlGroup.clans && cwlGroup.clans.length > 0) {
        let clanList = '';
        cwlGroup.clans.forEach((groupClan, index) => {
          const isCurrent = groupClan.tag === clan.clanTag;
          clanList += `${isCurrent ? '➡️ ' : ''}${index + 1}. ${groupClan.name}\n`;
        });
        
        embed.addFields({ 
          name: 'CWL Group (8 Clans)', 
          value: clanList 
        });
      }
      
      // Add round/war information
      if (cwlGroup.rounds && cwlGroup.rounds.length > 0) {
        let warsList = '';
        
        for (let i = 0; i < cwlGroup.rounds.length; i++) {
          const round = cwlGroup.rounds[i];
          const day = i + 1;
          
          if (round.warTags && round.warTags.length > 0) {
            warsList += `**Day ${day}**: ${round.warTags.length} wars scheduled\n`;
          } else {
            warsList += `**Day ${day}**: War pairings not yet determined\n`;
          }
        }
        
        embed.addFields({ 
          name: 'War Schedule', 
          value: warsList || 'No war schedule available yet' 
        });
      }
      
      // Process current/recent wars
      if (cwlGroup.rounds) {
        const wars = [];
        
        // Check each round for war data
        for (const round of cwlGroup.rounds) {
          if (round.warTags) {
            for (const warTag of round.warTags) {
              if (warTag !== '#0') {
                try {
                  // We need to check each war to see if our clan is participating
                  const warData = await clashApiService.getCWLWar(warTag);
                  
                  if (warData && 
                     (warData.clan.tag === clan.clanTag || warData.opponent.tag === clan.clanTag)) {
                    wars.push(warData);
                  }
                } catch (warError) {
                  log.warn(`Could not get war data for ${warTag}: ${warError.message}`);
                }
              }
            }
          }
        }
        
        // If we found wars, add them to the embed
        if (wars.length > 0) {
          let warResults = '';
          
          for (const war of wars) {
            // Determine if we're clan or opponent
            const isOurClanAttacking = war.clan.tag === clan.clanTag;
            const ourClanData = isOurClanAttacking ? war.clan : war.opponent;
            const opponentData = isOurClanAttacking ? war.opponent : war.clan;
            
            // Determine result if available
            let result = 'In Progress';
            if (war.state === 'warEnded') {
              if (ourClanData.stars > opponentData.stars) {
                result = '🏆 Win';
              } else if (ourClanData.stars < opponentData.stars) {
                result = '❌ Loss';
              } else if (ourClanData.destructionPercentage > opponentData.destructionPercentage) {
                result = '🏆 Win (%)';
              } else if (ourClanData.destructionPercentage < opponentData.destructionPercentage) {
                result = '❌ Loss (%)';
              } else {
                result = '🤝 Draw';
              }
            }
            
            warResults += `vs **${opponentData.name}**: ${result}\n`;
            warResults += `Stars: ${ourClanData.stars}⭐ - ${opponentData.stars}⭐\n`;
            warResults += `Destruction: ${ourClanData.destructionPercentage.toFixed(2)}% - ${opponentData.destructionPercentage.toFixed(2)}%\n\n`;
          }
          
          embed.addFields({ 
            name: 'CWL War Results', 
            value: warResults || 'No war results available yet' 
          });
        }
      }
      
      // Add note for members
      embed.setFooter({ 
        text: 'Data from Clash of Clans API - Use /cwl medals to see medal rewards' 
      });
      
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error(`Error handling API stats: ${error.message}`);
      throw error;
    }
  }
};
