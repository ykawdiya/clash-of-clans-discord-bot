// src/commands/war/stats.js
const { EmbedBuilder, SlashCommandBuilder} = require('discord.js');
const warTrackingService = require('../../services/warTrackingService');
const { Clan, User } = require('../../models');
const WarTracking = require('../../models/WarTracking');
const { command: log } = require('../../utils/logger');


module.exports = {
  data: new SlashCommandBuilder()
      .setName('war_stats')
      .setDescription('Show attack statistics'),
  
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
      
      // Check if there's an active war
      if (!warStatus.inWar) {
        // If no active war, show recent war history
        const recentWars = await WarTracking.find({
          clanTag: clan.clanTag,
          isActive: false
        }).sort({ endTime: -1 }).limit(5);
        
        if (recentWars.length === 0) {
          return interaction.editReply({
            content: 'No war history found for this clan.'
          });
        }
        
        // Create historical stats embed
        const embed = new EmbedBuilder()
          .setTitle(`${clan.name} - Recent War Statistics`)
          .setColor('#3498db');
          
        // Calculate overall stats
        const totalWars = recentWars.length;
        const wins = recentWars.filter(w => w.result === 'win').length;
        const losses = recentWars.filter(w => w.result === 'lose').length;
        const ties = recentWars.filter(w => w.result === 'tie').length;
        
        embed.addFields(
          { name: 'Recent Wars', value: `${totalWars} wars`, inline: true },
          { name: 'Record', value: `${wins}W - ${losses}L - ${ties}T`, inline: true },
          { name: 'Win Rate', value: `${Math.round(wins/totalWars*100)}%`, inline: true }
        );
        
        // Add recent war results
        let warHistory = '';
        for (const war of recentWars) {
          const resultEmoji = war.result === 'win' ? '🏆' : war.result === 'lose' ? '❌' : '🤝';
          warHistory += `${resultEmoji} vs ${war.opponent.name}: ${war.starsEarned || 0}⭐ to ${war.opponent.stars || 0}⭐\n`;
        }
        
        embed.addFields({ name: 'Recent Results', value: warHistory });
        
        // Find top performers across recent wars
        const memberPerformance = new Map();
        
        for (const war of recentWars) {
          for (const member of war.members) {
            if (!memberPerformance.has(member.playerTag)) {
              memberPerformance.set(member.playerTag, {
                name: member.name,
                attacks: 0,
                stars: 0,
                destruction: 0
              });
            }
            
            const perf = memberPerformance.get(member.playerTag);
            perf.attacks += member.attacksUsed || 0;
            perf.stars += member.starsEarned || 0;
            perf.destruction += member.attacksUsed ? (member.averageDestruction || 0) * member.attacksUsed : 0;
          }
        }
        
        // Sort by stars earned
        const topPerformers = Array.from(memberPerformance.values())
          .filter(p => p.attacks > 0)
          .sort((a, b) => b.stars - a.stars)
          .slice(0, 5);
          
        if (topPerformers.length > 0) {
          let performerText = '';
          for (const performer of topPerformers) {
            const avgStars = performer.attacks > 0 ? (performer.stars / performer.attacks).toFixed(1) : '0.0';
            const avgDestruction = performer.attacks > 0 ? (performer.destruction / performer.attacks).toFixed(1) : '0.0';
            performerText += `**${performer.name}**: ${performer.stars}⭐ in ${performer.attacks} attacks (${avgStars} avg)\n`;
          }
          
          embed.addFields({ name: 'Top Performers', value: performerText });
        }
        
        return interaction.editReply({ embeds: [embed] });
      }
      
      // Get active war from database
      const warTracking = await WarTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!warTracking) {
        return interaction.editReply({
          content: 'No active war tracking found in database.'
        });
      }
      
      // Create stats embed
      const embed = new EmbedBuilder()
        .setTitle(`War Statistics: ${clan.name} vs ${warStatus.data.opponent.name}`)
        .setDescription(`${warStatus.data.teamSize}v${warStatus.data.teamSize} War • ${warTrackingService.formatWarState(warStatus.data.state)}`)
        .setColor(warTrackingService.getWarStateColor(warStatus.data.state));
        
      // Add war status
      embed.addFields(
        { name: 'War Status', value: `${warStatus.data.clan.stars || 0}⭐ vs ${warStatus.data.opponent.stars || 0}⭐`, inline: true },
        { name: 'Destruction', value: `${warStatus.data.clan.destructionPercentage?.toFixed(2) || 0}% vs ${warStatus.data.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
      );
      
      // Add attack usage
      const attacksUsed = warTracking.attacksUsed || 0;
      const totalAttacks = warStatus.data.teamSize * 2;
      
      embed.addFields({
        name: 'Attack Usage',
        value: `${attacksUsed}/${totalAttacks} (${Math.round(attacksUsed/totalAttacks*100)}%)`,
        inline: true
      });
      
      // Add member performances
      const attackers = warTracking.members
        .filter(m => m.attacksUsed > 0)
        .sort((a, b) => b.starsEarned - a.starsEarned || b.bestAttackPercentage - a.bestAttackPercentage);
        
      if (attackers.length > 0) {
        let attackerText = '';
        for (const attacker of attackers) {
          const stars = attacker.starsEarned || 0;
          const attacks = attacker.attacksUsed || 0;
          const bestAttack = `${attacker.bestAttackStars || 0}⭐ ${attacker.bestAttackPercentage?.toFixed(0) || 0}%`;
          
          attackerText += `**${attacker.name}**: ${stars}⭐ in ${attacks} attack(s) • Best: ${bestAttack}\n`;
          
          // Limit to top 10 performers to avoid too long message
          if (attackerText.split('\n').length > 10) {
            attackerText += `*...and ${attackers.length - 10} more*`;
            break;
          }
        }
        
        embed.addFields({ name: 'Attack Performances', value: attackerText });
      }
      
      // Add members who haven't attacked
      const nonAttackers = warTracking.members
        .filter(m => m.attacksUsed === 0)
        .map(m => m.name);
        
      if (nonAttackers.length > 0) {
        embed.addFields({ 
          name: 'Attacks Remaining', 
          value: nonAttackers.join(', ') || 'Everyone has used their attacks!'
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error executing war stats command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting war statistics. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting war statistics. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};
