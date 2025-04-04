// src/commands/cwl/status.js
const { EmbedBuilder, SlashCommandBuilder} = require('discord.js');
const cwlTrackingService = require('../../services/cwlTrackingService');
const { Clan, User } = require('../../models');;
const CWLTracking = require('../../models/CWLTracking');
const clashApiService = require('../../services/clashApiService');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Show current CWL status'),

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
      
      // First, try to get the CWL group from the API
      try {
        const cwlGroup = await clashApiService.getCWLGroup(clan.clanTag);
        
        // If we have CWL group data, show it
        if (cwlGroup && cwlGroup.state) {
          const embed = this.createCWLGroupEmbed(clan, cwlGroup);
          return interaction.editReply({ embeds: [embed] });
        }
      } catch (error) {
        log.warn(`Could not retrieve CWL group for ${clan.name}: ${error.message}`);
        // Continue to fallback option
      }
      
      // Fallback to database tracking if API didn't provide data
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        // If no active CWL in API or database, show calendar-based status
        const now = new Date();
        const dayOfMonth = now.getDate();
        
        // First week of month is likely CWL
        if (dayOfMonth <= 7) {
          const embed = new EmbedBuilder()
            .setTitle('CWL Status')
            .setDescription(`No active CWL data found for ${clan.name}.`)
            .setColor('#f1c40f')
            .addFields({
              name: 'Possible CWL Period',
              value: 'It\'s the first week of the month, which is typically when CWL occurs. Check in-game to see if CWL is active.'
            })
            .addFields({
              name: '⚠️ API Limitations',
              value: 'The Clash of Clans API only provides CWL data when:\n1. CWL is active in-game\n2. War log is public\n3. The clan is registered for CWL'
            })
            .addFields({
              name: 'Manual Tracking',
              value: 'You can still use `/cwl roster` commands to manage your CWL roster manually.'
            })
            .setFooter({ text: 'Refer to API_REFERENCE.md for more information on API limitations' });
          
          return interaction.editReply({ embeds: [embed] });
        }
        
        // End of month might be upcoming CWL
        if (dayOfMonth >= 28) {
          const embed = new EmbedBuilder()
            .setTitle('CWL Status: Not Active')
            .setDescription(`No active CWL found for ${clan.name}.`)
            .setColor('#7289da')
            .addFields({
              name: 'CWL Schedule',
              value: 'CWL typically runs during the first week of each month. Signup usually begins around the 1st day of the month.'
            })
            .addFields({
              name: 'Get Ready',
              value: 'Use `/cwl roster` commands to prepare your roster for the upcoming CWL season.'
            })
            .setFooter({ text: 'Based on typical CWL schedule, not live data' });
            
          return interaction.editReply({ embeds: [embed] });
        }
        
        // Mid-month, definitely not CWL period
        const embed = new EmbedBuilder()
          .setTitle('CWL Status: Not Active')
          .setDescription(`There is no active CWL season for ${clan.name} at this time.`)
          .setColor('#95a5a6')
          .addFields({
            name: 'Next CWL',
            value: `CWL typically begins on the 1st of each month. The next CWL season should start in approximately ${30 - dayOfMonth} days.`
          })
          .addFields({
            name: 'Preparation',
            value: 'You can use this time to:\n• Upgrade heroes and troops\n• Practice war attacks\n• Plan your CWL roster using `/cwl roster` commands'
          })
          .setFooter({ text: 'Based on typical CWL schedule, not live data' });
            
        return interaction.editReply({ embeds: [embed] });
      }
      
      // Active CWL season found in database
      const embed = new EmbedBuilder()
        .setTitle(`CWL Status: ${clan.name}`)
        .setDescription(`Season: ${cwlTracking.season} • League: ${cwlTracking.league}`)
        .setColor('#9b59b6')
        .addFields(
          { name: 'Current Day', value: `Day ${cwlTracking.currentDay}/7`, inline: true }
        )
        .setFooter({ text: 'This data is from server tracking, may differ from in-game status' });
        
      // Add war stats if available
      if (cwlTracking.warDays && cwlTracking.warDays.length > 0) {
        const warWins = cwlTracking.warDays.filter(day => day.outcome === 'win').length;
        const totalWars = cwlTracking.warDays.filter(day => day.outcome !== 'ongoing').length;
        
        embed.addFields(
          { name: 'War Record', value: `${warWins}/${totalWars} wars won`, inline: true },
          { name: 'Current Position', value: totalWars > 0 ? `${cwlTracking.warDays.filter(d => d.outcome === 'win').length + 1}/8 (estimated)` : 'TBD', inline: true }
        );
        
        // Add war results
        let warResults = '';
        const sortedDays = [...cwlTracking.warDays].sort((a, b) => a.day - b.day);
        
        for (const day of sortedDays) {
          const resultEmoji = day.outcome === 'win' ? '🏆' : 
                            day.outcome === 'lose' ? '❌' : 
                            day.outcome === 'tie' ? '🤝' : '⏳';
          
          warResults += `Day ${day.day}: ${resultEmoji} vs ${day.opponent.name} - ${day.stars || 0}⭐ to ${day.opponentStars || 0}⭐\n`;
        }
        
        embed.addFields({ name: 'War Results', value: warResults });
      }
      
      // Add roster size
      if (cwlTracking.roster && cwlTracking.roster.length > 0) {
        embed.addFields({ name: 'Roster Size', value: `${cwlTracking.roster.length} members`, inline: true });
      }
      
      // Current war information
      if (cwlTracking.currentDay > 0 && cwlTracking.currentDay <= 7) {
        const currentWar = cwlTracking.warDays.find(day => day.day === cwlTracking.currentDay);
        
        if (currentWar && currentWar.outcome === 'ongoing') {
          embed.addFields({
            name: `Current War (Day ${cwlTracking.currentDay})`,
            value: `vs ${currentWar.opponent.name}\nStars: ${currentWar.stars || 0}⭐ - ${currentWar.opponentStars || 0}⭐\nDestruction: ${currentWar.destruction?.toFixed(2) || 0}% - ${currentWar.opponentDestruction?.toFixed(2) || 0}%`
          });
        }
      }
      
      // Add instructions
      let instructions = '';
      
      if (cwlTracking.currentDay === 0) {
        instructions = 'CWL has been registered! Set up your roster using `/cwl roster add` before war days begin.';
      } else if (cwlTracking.currentDay > 0 && cwlTracking.currentDay <= 7) {
        instructions = 'Remember that each player only gets ONE attack per war day in CWL!\nView the current roster with `/cwl roster view`';
      }
      
      if (instructions) {
        embed.addFields({ name: 'Instructions', value: instructions });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error executing cwl status command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting CWL status. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting CWL status. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  // Create an embed from live CWL group data
  createCWLGroupEmbed(clan, cwlGroup) {
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`CWL Status: ${clan.name}`)
      .setDescription(`Season: ${cwlGroup.season || 'Current Season'}`)
      .setColor('#9b59b6')
      .setFooter({ text: 'Live data from Clash of Clans API' });
    
    // Add state information
    embed.addFields(
      { name: 'Status', value: this.formatCWLState(cwlGroup.state), inline: true }
    );
    
    // Try to find our clan in the group
    const ourClan = cwlGroup.clans?.find(c => c.tag === clan.clanTag);
    
    if (ourClan) {
      // Add clan's league
      if (ourClan.clanLevel) {
        embed.addFields({ name: 'Clan Level', value: ourClan.clanLevel.toString(), inline: true });
      }
    }
    
    // Add group information
    if (cwlGroup.clans && cwlGroup.clans.length > 0) {
      embed.addFields({ name: 'Group Size', value: cwlGroup.clans.length.toString(), inline: true });
      
      // List clans in the group
      let clanList = '';
      cwlGroup.clans.forEach((groupClan, index) => {
        // Mark our clan
        const isCurrent = groupClan.tag === clan.clanTag;
        clanList += `${isCurrent ? '➡️ ' : ''}${index + 1}. ${groupClan.name} (${groupClan.tag})\n`;
      });
      
      embed.addFields({ name: 'Clans in Group', value: clanList });
    }
    
    // Add round information if available
    if (cwlGroup.rounds && cwlGroup.rounds.length > 0) {
      embed.addFields({ 
        name: 'War Schedule', 
        value: `${cwlGroup.rounds.length} rounds of wars scheduled`
      });
      
      // If we have war tags in the rounds, we can show more detail
      const hasWarTags = cwlGroup.rounds.some(r => r.warTags && r.warTags.length > 0);
      
      if (hasWarTags) {
        // Find wars that include our clan
        const ourWarTags = [];
        
        cwlGroup.rounds.forEach((round, roundIndex) => {
          if (round.warTags) {
            // For each war tag, we'll need to check if it includes our clan
            // But we can't do that here as it would require additional API calls
            // Just note that war tags exist for lookup
            ourWarTags.push(...round.warTags.filter(tag => tag !== '#0'));
          }
        });
        
        if (ourWarTags.length > 0) {
          embed.addFields({ 
            name: 'War Information', 
            value: `Wars can be viewed individually using the CWL API.\nUse \`/war status\` during active war days to see details.`
          });
        }
      }
    } else {
      // No rounds found
      embed.addFields({ 
        name: 'War Schedule', 
        value: 'No war rounds found. CWL may be in sign-up or preparation phase.'
      });
    }
    
    // Add user instructions
    embed.addFields({
      name: 'Instructions',
      value: 'Use `/cwl roster` commands to manage your CWL roster.\nEach player gets ONE attack per war in CWL.'
    });
    
    return embed;
  },
  
  // Format CWL state for display
  formatCWLState(state) {
    switch (state) {
      case 'preparation':
        return '⏳ Preparation Phase';
      case 'inWar':
        return '⚔️ War Phase';
      case 'ended':
        return '🏁 Completed';
      default:
        return state;
    }
  }
};
