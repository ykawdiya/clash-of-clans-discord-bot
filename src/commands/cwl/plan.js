// src/commands/cwl/plan.js
const { EmbedBuilder, SlashCommandBuilder} = require('discord.js');
const cwlTrackingService = require('../../services/cwlTrackingService');
const { Clan, User } = require('../../models');
const CWLTracking = require('../../models/CWLTracking');
const clashApiService = require('../../services/clashApiService');
const { userPermission } = require('../../utils/permissions');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('plan')
      .setDescription('View CWL war plan and attack status')
      .addIntegerOption(option =>
          option.setName('day')
              .setDescription('CWL war day (1-7)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(7)
      ),
  
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
      
      // Try to get CWL data from API first
      try {
        const cwlGroup = await clashApiService.getCWLGroup(clan.clanTag);
        
        if (cwlGroup && cwlGroup.clans) {
          // API data is available - use it
          return await this.handleApiWarPlan(interaction, clan, cwlGroup);
        }
      } catch (apiError) {
        log.warn(`Could not get CWL data from API: ${apiError.message}. Falling back to database.`);
      }
      
      // If API data not available, fall back to database
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        return interaction.editReply({
          content: 'There is no active CWL season.'
        });
      }
      
      // Get day parameter
      let warDay = interaction.options.getInteger('day');
      
      if (!warDay) {
        warDay = cwlTracking.currentDay;
      }
      
      // Check if valid day
      if (warDay < 1 || warDay > 7) {
        return interaction.editReply({
          content: 'Invalid CWL day. Please specify a day between 1 and 7.'
        });
      }
      
      // Check if this day's war exists
      const dayWar = cwlTracking.warDays.find(day => day.day === warDay);
      
      if (!dayWar) {
        return interaction.editReply({
          content: `No war data found for day ${warDay}. This war may not have started yet.`
        });
      }
      
      // Create plan embed
      const embed = new EmbedBuilder()
        .setTitle(`CWL Day ${warDay} War Plan: ${clan.name} vs ${dayWar.opponent.name}`)
        .setColor('#9b59b6');
      
      // Add war status
      if (dayWar.outcome === 'ongoing') {
        embed.setDescription(`Battle in Progress • Stars: ${dayWar.stars || 0}⭐ vs ${dayWar.opponentStars || 0}⭐`);
        
        // Time remaining if endTime is available
        if (dayWar.endTime) {
          const endTime = new Date(dayWar.endTime);
          const timeUntil = endTime - new Date();
          
          if (timeUntil > 0) {
            const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
            const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
            
            embed.addFields({ name: 'Time Remaining', value: `${hoursUntil}h ${minutesUntil}m` });
          }
        }
      } else {
        const resultEmoji = dayWar.outcome === 'win' ? '🏆 Victory' : 
                          dayWar.outcome === 'lose' ? '❌ Defeat' : 
                          dayWar.outcome === 'tie' ? '🤝 Tie' : 'Unknown';
                          
        embed.setDescription(`War Ended: ${resultEmoji} • Stars: ${dayWar.stars || 0}⭐ vs ${dayWar.opponentStars || 0}⭐`);
      }
      
      // Add roster info - CWL roster with assigned targets
      if (cwlTracking.roster && cwlTracking.roster.length > 0) {
        // Get member data
        const members = cwlTracking.members || [];
        
        // Create roster text
        let rosterText = '';
        let attacksRemaining = '';
        
        // Sort roster by TH level and name
        const rosterMembers = [];
        
        for (const tag of cwlTracking.roster) {
          const member = members.find(m => m.playerTag === tag);
          if (member) {
            rosterMembers.push(member);
          }
        }
        
        // Sort by town hall level and then name
        rosterMembers.sort((a, b) => {
          if (b.townhallLevel !== a.townhallLevel) return b.townhallLevel - a.townhallLevel;
          return a.name.localeCompare(b.name);
        });
        
        // Generate roster text
        for (const member of rosterMembers) {
          // Check if this member has attacked in this war
          const hasAttacked = member.attacks && member.attacks.some(a => a.warDay === warDay);
          
          if (hasAttacked) {
            // Show attack result
            const attack = member.attacks.find(a => a.warDay === warDay);
            rosterText += `✅ **${member.name}** (TH${member.townhallLevel}): ${attack.stars}⭐ ${attack.destructionPercentage.toFixed(1)}%\n`;
          } else {
            // Show as available
            rosterText += `⏳ **${member.name}** (TH${member.townhallLevel}): *Attack not used yet*\n`;
            attacksRemaining += `${member.name}, `;
          }
        }
        
        embed.addFields({ name: 'Roster Status', value: rosterText || 'No roster data available' });
        
        if (attacksRemaining && dayWar.outcome === 'ongoing') {
          embed.addFields({ name: 'Attacks Remaining', value: attacksRemaining.slice(0, -2) || 'Everyone has attacked!' });
        }
      }
      
      // Add attack tips
      if (dayWar.outcome === 'ongoing') {
        embed.addFields({
          name: 'CWL Attack Tips',
          value: [
            '• You only get ONE attack - make it count!',
            '• Prioritize stars over percentage',
            '• Attack bases you can 3-star rather than reaching too high',
            '• Coordinate with teammates to maximize stars'
          ].join('\n')
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error executing cwl plan command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting the CWL plan. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting the CWL plan. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle API-based CWL war plan display
   * @param {Interaction} interaction - Discord interaction
   * @param {Object} clan - Clan document
   * @param {Object} cwlGroup - CWL group data from API
   */
  async handleApiWarPlan(interaction, clan, cwlGroup) {
    try {
      // Get day parameter
      let requestedDay = interaction.options.getInteger('day');
      
      // If we have rounds data, look for wars
      if (cwlGroup.rounds && cwlGroup.rounds.length > 0) {
        // Current day is based on rounds with war tags
        let currentDay = 0;
        let warData = null;
        
        // If a specific day is requested, try to get that war
        if (requestedDay && requestedDay > 0 && requestedDay <= cwlGroup.rounds.length) {
          // Get the requested day's round
          const round = cwlGroup.rounds[requestedDay - 1];
          
          // Check if this round has war tags
          if (round.warTags && round.warTags.length > 0) {
            // Look for a war involving our clan
            for (const warTag of round.warTags) {
              if (warTag !== '#0') { // Skip placeholder tags
                try {
                  const war = await clashApiService.getCWLWar(warTag);
                  if (war && (war.clan.tag === clan.clanTag || war.opponent.tag === clan.clanTag)) {
                    // Found our war for this day
                    warData = war;
                    currentDay = requestedDay;
                    break;
                  }
                } catch (error) {
                  log.warn(`Error getting CWL war data for ${warTag}: ${error.message}`);
                }
              }
            }
          }
        }
        
        // If no specific day requested or not found, find the current/most recent war
        if (!warData) {
          // Look through all rounds for wars
          for (let i = 0; i < cwlGroup.rounds.length; i++) {
            const round = cwlGroup.rounds[i];
            const day = i + 1;
            
            if (round.warTags && round.warTags.length > 0) {
              // Look for a war involving our clan
              for (const warTag of round.warTags) {
                if (warTag !== '#0') { // Skip placeholder tags
                  try {
                    const war = await clashApiService.getCWLWar(warTag);
                    if (war && (war.clan.tag === clan.clanTag || war.opponent.tag === clan.clanTag)) {
                      // Found a war
                      warData = war;
                      currentDay = day;
                      
                      // If the war is in progress, this is the current day
                      if (war.state === 'inWar') {
                        break; // Stop looking, we found the active war
                      }
                    }
                  } catch (error) {
                    log.warn(`Error getting CWL war data for ${warTag}: ${error.message}`);
                  }
                }
              }
              
              // If we found an in-progress war, stop looking
              if (warData && warData.state === 'inWar') {
                break;
              }
            }
          }
        }
        
        // If we found a war, display it
        if (warData) {
          // Make sure we know which side is our clan
          const isOurClanAttacking = warData.clan.tag === clan.clanTag;
          const ourClan = isOurClanAttacking ? warData.clan : warData.opponent;
          const opponentClan = isOurClanAttacking ? warData.opponent : warData.clan;
          
          // Create embed
          const embed = new EmbedBuilder()
            .setTitle(`CWL Day ${currentDay} War: ${ourClan.name} vs ${opponentClan.name}`)
            .setColor('#9b59b6');
          
          // Add war status
          let statusText = '';
          
          switch (warData.state) {
            case 'preparation':
              statusText = '⏳ Preparation Phase';
              break;
            case 'inWar':
              statusText = '⚔️ Battle Day';
              break;
            case 'warEnded':
              statusText = '🏁 War Ended';
              break;
            default:
              statusText = warData.state;
          }
          
          embed.setDescription(`Status: ${statusText}`);
          
          // Add team size and score
          embed.addFields(
            { name: 'Team Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true },
            { name: 'Stars', value: `${ourClan.stars || 0}⭐ - ${opponentClan.stars || 0}⭐`, inline: true },
            { name: 'Destruction', value: `${ourClan.destructionPercentage?.toFixed(2) || 0}% - ${opponentClan.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
          );
          
          // Add time information
          if (warData.startTime && warData.endTime) {
            const startTime = new Date(warData.startTime);
            const endTime = new Date(warData.endTime);
            const now = new Date();
            
            if (warData.state === 'inWar' && now < endTime) {
              // Calculate time remaining
              const timeRemaining = endTime - now;
              const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
              const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
              
              embed.addFields({
                name: 'Time Remaining',
                value: `${hoursRemaining}h ${minutesRemaining}m`
              });
            } else if (warData.state === 'preparation') {
              // Calculate time until war starts
              const timeUntilStart = startTime - now;
              const hoursUntil = Math.floor(timeUntilStart / (1000 * 60 * 60));
              const minutesUntil = Math.floor((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
              
              embed.addFields({
                name: 'War Starts In',
                value: `${hoursUntil}h ${minutesUntil}m`
              });
            }
          }
          
          // Add member information
          if (ourClan.members && ourClan.members.length > 0) {
            let attacksUsed = 0;
            let attacksAvailable = ourClan.members.length;
            let attacksSummary = '';
            
            // Sort members by position (map number)
            const sortedMembers = [...ourClan.members].sort((a, b) => a.mapPosition - b.mapPosition);
            
            for (const member of sortedMembers) {
              const hasAttacked = member.attacks && member.attacks.length > 0;
              
              if (hasAttacked) {
                attacksUsed++;
                
                // Get the attack details
                const attack = member.attacks[0]; // CWL only has 1 attack per person
                attacksSummary += `${member.mapPosition}. ✅ **${member.name}** (TH${member.townhallLevel}) → ${attack.stars}⭐ (${attack.destructionPercentage}%)\n`;
              } else {
                attacksSummary += `${member.mapPosition}. ⏳ **${member.name}** (TH${member.townhallLevel}) → Attack not used yet\n`;
              }
            }
            
            // Add simplified summary - focus on who hasn't attacked yet
            const remainingAttacks = attacksAvailable - attacksUsed;
            if (remainingAttacks > 0 && warData.state === 'inWar') {
              const pendingMembers = sortedMembers
                .filter(m => !(m.attacks && m.attacks.length > 0))
                .map(m => m.name)
                .join(', ');
              
              embed.addFields(
                { name: 'Attacks Remaining', value: `${remainingAttacks} members still need to attack:\n${pendingMembers}`, inline: false }
              );
            } else {
              embed.addFields(
                { name: 'Attack Status', value: `${attacksUsed}/${attacksAvailable} attacks used`, inline: false }
              );
            }
          }
          
          // Simplified CWL tips (only show if in war and attacks remaining)
          if (warData.state === 'inWar' && (attacksAvailable - attacksUsed > 0)) {
            embed.addFields({
              name: 'Reminder',
              value: '• ONE attack per player in CWL\n• Prioritize stars over percentage'
            });
          }
          
          // Send the embed
          return interaction.editReply({ embeds: [embed] });
        }
      }
      
      // If we got here, we couldn't find a war to display
      return interaction.editReply({
        content: 'No CWL war found for this clan. War pairings may not be determined yet, or the CWL season has ended.'
      });
    } catch (error) {
      log.error(`Error handling API war plan: ${error.message}`);
      
      // Fall back to a generic message
      return interaction.editReply({
        content: 'An error occurred while retrieving CWL war information. Please try again later.'
      });
    }
  }
};
