// src/commands/war/status.js
const { EmbedBuilder, SlashCommandBuilder} = require('discord.js');
const warTrackingService = require('../../services/warTrackingService');
const { Clan, User } = require('../../models');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('war_status')
      .setDescription('Show current war status'),
  
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
      
      if (!warStatus.inWar) {
        return interaction.editReply({
          content: 'The clan is not currently in a war.'
        });
      }
      
      // Get war data
      const warData = warStatus.data;
      
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
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`War Status: ${clan.name} vs ${warData.opponent.name}`)
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
        )
        .addFields(
          { name: 'War Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true },
          { name: 'Time', value: timeRemaining, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: `${clan.name}`, value: `${warData.clan.stars || 0}⭐ | ${warData.clan.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: `${warData.opponent.name}`, value: `${warData.opponent.stars || 0}⭐ | ${warData.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        );
      
      // Add attack usage
      if (warData.clan.attacks) {
        const attacksUsed = warData.clan.attacks;
        const totalAttacks = warData.teamSize * 2;
        
        embed.addFields({
          name: 'Attack Usage',
          value: `${attacksUsed}/${totalAttacks} (${Math.round(attacksUsed/totalAttacks*100)}%)`,
          inline: true
        });
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
      
      await interaction.editReply({ embeds: [embed] });
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
