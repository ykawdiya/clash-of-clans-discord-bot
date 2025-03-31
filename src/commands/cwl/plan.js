// src/commands/cwl/plan.js
const { EmbedBuilder } = require('discord.js');
const cwlTrackingService = require('../../services/cwlTrackingService');
const Clan = require('../../models/Clan');
const CWLTracking = require('../../models/CWLTracking');
const { userPermission } = require('../../utils/permissions');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: {
    name: 'plan',
    description: 'View/create CWL war plan',
    options: [
      {
        name: 'day',
        description: 'CWL war day (1-7)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 7
      }
    ]
  },
  
  async execute(interaction) {
    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Elder', 'Co-Leader', 'Leader']);
      
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
      
      // Get CWL tracking
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
  }
};
