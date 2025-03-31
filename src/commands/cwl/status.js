// src/commands/cwl/status.js
const { EmbedBuilder } = require('discord.js');
const cwlTrackingService = require('../../services/cwlTrackingService');
const Clan = require('../../models/Clan');
const CWLTracking = require('../../models/CWLTracking');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: {
    name: 'status',
    description: 'Show current CWL status'
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
      
      // Check if there's an active CWL season
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        // Check if CWL is in signup period
        const isSignupPhase = cwlTrackingService.isInSignupPhase();
        
        if (isSignupPhase) {
          const embed = new EmbedBuilder()
            .setTitle('CWL Sign-up Period Active')
            .setDescription('The Clan War League sign-up period is currently active!')
            .setColor('#f1c40f')
            .addFields({
              name: 'Next Steps',
              value: [
                '1. Register for CWL in-game',
                '2. Set up your CWL roster using `/cwl roster add`',
                '3. Prepare your clan for 7 consecutive war days'
              ].join('\n')
            });
            
          return interaction.editReply({ embeds: [embed] });
        }
        
        // Check if CWL is in the upcoming 2 days (prediction)
        const now = new Date();
        const dayOfMonth = now.getDate();
        
        if (dayOfMonth >= 28 || dayOfMonth <= 2) {
          const embed = new EmbedBuilder()
            .setTitle('CWL Status: Not Active')
            .setDescription('Clan War League is not currently active.')
            .setColor('#7289da')
            .addFields({
              name: 'CWL Schedule',
              value: 'CWL typically runs during the first week of each month. Signup usually begins around the 1st day of the month.'
            });
            
          return interaction.editReply({ embeds: [embed] });
        }
        
        // Not in CWL period
        return interaction.editReply({
          content: 'There is no active CWL season at the moment.'
        });
      }
      
      // Active CWL season found
      const embed = new EmbedBuilder()
        .setTitle(`CWL Status: ${clan.name}`)
        .setDescription(`Season: ${cwlTracking.season} • League: ${cwlTracking.league}`)
        .setColor('#9b59b6')
        .addFields(
          { name: 'Current Day', value: `Day ${cwlTracking.currentDay}/7`, inline: true }
        );
        
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
  }
};
