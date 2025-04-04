// src/commands/war/status.js (Enhanced with advanced war data)
const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const warTrackingService = require('../../services/warTrackingService');
const clashApiService = require('../../services/clashApiService');
const { Clan, User } = require('../../models');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('war__status')
      .setDescription('Show current war status'),
      // Use double underscore to avoid conflicts during dev; this command is meant to be used as a subcommand
  
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
      
      // Get war data directly from API
      const warData = await clashApiService.getCurrentWar(clan.clanTag);
      
      // Handle cases where war data isn't available
      if (!warData) {
        return interaction.editReply({
          content: 'No current war found. The clan may not be in a war or the war log may be private.'
        });
      }
      
      if (warData.state === 'notInWar') {
        return interaction.editReply({
          content: 'The clan is not currently in a war.'
        });
      }
      
      // Handle API placeholders (if API is unavailable)
      if (warData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve war data for ${clan.name}.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- War log being set to private\n\nTry again later or check that the clan's war log is set to public.`
        });
      }
      
      // Format preparation/battle time remaining
      let timeRemaining = '';
      if (warData.state === 'preparation') {
        const startTime = new Date(warData.startTime);
        const timeUntil = startTime - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        timeRemaining = `Battle day starts in ${hoursUntil}h ${minutesUntil}m`;
      } else if (warData.state === 'inWar') {
        const endTime = new Date(warData.endTime);
        const timeUntil = endTime - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        timeRemaining = `War ends in ${hoursUntil}h ${minutesUntil}m`;
      } else if (warData.state === 'warEnded') {
        timeRemaining = 'War has ended';
      }
      
      // Create embed for war overview
      const embed = new EmbedBuilder()
        .setTitle(`War Status: ${warData.clan.name} vs ${warData.opponent.name}`)
        .setDescription(
          warData.state === 'preparation' ? '⏳ Preparation Day' : 
          warData.state === 'inWar' ? '⚔️ Battle Day' : 
          warData.state === 'warEnded' ? '🏁 War Ended' : 
          'Unknown state'
        )
        .setColor(
          warData.state === 'preparation' ? '#f1c40f' : 
          warData.state === 'inWar' ? '#e67e22' : 
          warData.state === 'warEnded' ? '#2ecc71' : 
          '#7289da'
        );
      
      // Add war info fields
      embed.addFields(
        { name: 'War Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true },
        { name: 'Time', value: timeRemaining, inline: true }
      );
      
      // Add war score
      if (warData.state !== 'preparation') {
        embed.addFields(
          { name: '\u200B', value: '\u200B', inline: true }, // Spacer for alignment
          { name: `${warData.clan.name}`, value: `${warData.clan.stars || 0}⭐ | ${warData.clan.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: `${warData.opponent.name}`, value: `${warData.opponent.stars || 0}⭐ | ${warData.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true } // Spacer for alignment
        );
      }
      
      // Add attack usage
      if (warData.state !== 'preparation' && warData.clan.attacks !== undefined) {
        const attacksUsed = warData.clan.attacks;
        const totalAttacks = warData.teamSize * 2;
        const attackPercentage = Math.round((attacksUsed / totalAttacks) * 100);
        
        // Add visual meter for attack usage
        const progressBarLength = 20;
        const filledBars = Math.round((attacksUsed / totalAttacks) * progressBarLength);
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(progressBarLength - filledBars);
        
        embed.addFields({
          name: 'Attack Usage',
          value: `${progressBar}\n${attacksUsed}/${totalAttacks} (${attackPercentage}%)`,
          inline: false
        });
      }
      
      // Add attack summary if in battle day or war ended
      if ((warData.state === 'inWar' || warData.state === 'warEnded') && 
          warData.clan.members && warData.clan.members.some(m => m.attacks)) {
        
        // Calculate stars statistics
        let totalStars = 0;
        let totalPossibleStars = 0;
        let totalDestruction = 0;
        let attackCount = 0;
        let threeStarCount = 0;
        let twoStarCount = 0;
        let oneStarCount = 0;
        let zeroStarCount = 0;
        
        // Process all attacks
        for (const member of warData.clan.members) {
          if (!member.attacks) continue;
          
          for (const attack of member.attacks) {
            totalStars += attack.stars;
            totalPossibleStars += 3;
            totalDestruction += attack.destructionPercentage;
            attackCount++;
            
            if (attack.stars === 3) threeStarCount++;
            else if (attack.stars === 2) twoStarCount++;
            else if (attack.stars === 1) oneStarCount++;
            else zeroStarCount++;
          }
        }
        
        // Calculate averages
        const avgStars = totalStars / attackCount || 0;
        const avgDestruction = totalDestruction / attackCount || 0;
        const starPercentage = Math.round((totalStars / totalPossibleStars) * 100);
        
        // Add attack summary
        embed.addFields({
          name: 'Attack Summary',
          value: [
            `Average Stars: ${avgStars.toFixed(1)} (${starPercentage}% of possible stars)`,
            `Average Destruction: ${avgDestruction.toFixed(1)}%`,
            `Three Stars: ${threeStarCount} | Two Stars: ${twoStarCount} | One Star: ${oneStarCount} | Zero Stars: ${zeroStarCount}`
          ].join('\n'),
          inline: false
        });
      }
      
      // Create a second embed for member details (if we're in battle day or war ended)
      let membersEmbed = null;
      
      if ((warData.state === 'inWar' || warData.state === 'warEnded') && warData.clan.members) {
        membersEmbed = new EmbedBuilder()
          .setTitle(`War Members - ${warData.clan.name}`)
          .setColor(
            warData.state === 'inWar' ? '#e67e22' : 
            warData.state === 'warEnded' ? '#2ecc71' : 
            '#7289da'
          );
        
        // Sort members by map position
        const sortedMembers = [...warData.clan.members].sort((a, b) => a.mapPosition - b.mapPosition);
        
        // Create member info with attack status
        let memberList = '';
        
        for (const member of sortedMembers) {
          const attacksUsed = member.attacks ? member.attacks.length : 0;
          const attacksRemaining = 2 - attacksUsed;
          let attackInfo = '';
          
          if (member.attacks && member.attacks.length > 0) {
            // Format attacks
            attackInfo = member.attacks.map(attack => {
              const defenderNumber = warData.opponent.members.find(m => m.tag === attack.defenderTag)?.mapPosition || '?';
              return `→ #${defenderNumber}: ${attack.stars}⭐ ${attack.destructionPercentage.toFixed(0)}%`;
            }).join(' | ');
          } else {
            attackInfo = `No attacks yet ⚠️`;
          }
          
          const statusEmoji = attacksUsed === 2 ? '✅' : (attacksUsed === 1 ? '⚠️' : '❌');
          
          memberList += `${statusEmoji} **#${member.mapPosition}** TH${member.townhallLevel} ${member.name}\n`;
          memberList += `   ${attackInfo}\n`;
        }
        
        // Add member list to embed
        if (memberList) {
          membersEmbed.setDescription(memberList);
        } else {
          membersEmbed.setDescription('No member information available.');
        }
      }
      
      // Add instructions
      if (warData.state === 'preparation') {
        embed.addFields({
          name: 'Preparation Day Instructions',
          value: 'Use `/war call` to reserve bases for attacks.\nVerify war CC troops and make any needed changes to your base.'
        });
      } else if (warData.state === 'inWar') {
        embed.addFields({
          name: 'Battle Day Instructions',
          value: 'Use `/war map` to view the current war status and base reservations.\nAttack your assigned targets or follow the war plan.'
        });
      }
      
      // Add a footer with data timestamp
      embed.setFooter({ 
        text: `Data updated: ${new Date().toLocaleString()}`
      });
      
      // Send the embeds
      if (membersEmbed) {
        // If we have member details, send both embeds
        await interaction.editReply({ 
          embeds: [embed, membersEmbed]
        });
      } else {
        // Otherwise just send the main embed
        await interaction.editReply({ 
          embeds: [embed]
        });
      }
    } catch (error) {
      log.error('Error executing war status command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting war status. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting war status. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};