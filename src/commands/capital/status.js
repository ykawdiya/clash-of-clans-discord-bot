// src/commands/capital/status.js (Enhanced for direct API usage)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Clan } = require('../../models');
const clashApiService = require('../../services/clashApiService');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('View Clan Capital status'),

  async execute(interaction) {
    try {
      // Get the clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });

      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }

      // Defer reply since this might take some time
      await interaction.deferReply();

      // Get clan data from API directly
      const clanData = await clashApiService.getClan(clan.clanTag);
      
      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the clan tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve Clan Capital data for "${clan.clanTag}" from the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Make sure clan capital data exists
      if (!clanData.clanCapital) {
        return interaction.editReply({
          content: `No Clan Capital data found for ${clanData.name}. The clan may not have the Clan Capital feature unlocked yet.`
        });
      }
      
      // Create embed with capital info
      const embed = this.createCapitalEmbed(clanData);
      
      return interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      log.error('Error executing capital status command:', { error: error.message });

      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while processing your request. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while processing your request. Please try again later.',
          ephemeral: true
        });
      }
    }
  },

  createCapitalEmbed(clanData) {
    const capitalData = clanData.clanCapital;
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`${clanData.name} - Clan Capital`)
      .setDescription(`Capital Hall Level: ${capitalData.capitalHallLevel}`)
      .setColor('#4CAF50');
    
    // Add clan badge if available
    if (clanData.badgeUrls && clanData.badgeUrls.medium) {
      embed.setThumbnail(clanData.badgeUrls.medium);
    }
    
    // Check capital points and league
    if (clanData.clanCapitalPoints) {
      embed.addFields({ 
        name: 'Capital Points', 
        value: clanData.clanCapitalPoints.toString(), 
        inline: true 
      });
    }
    
    // Add capital league if available
    if (clanData.capitalLeague) {
      embed.addFields({ 
        name: 'Capital League', 
        value: clanData.capitalLeague.name, 
        inline: true 
      });
    }
    
    // Add district information
    if (capitalData.districts && capitalData.districts.length > 0) {
      let districtList = '';
      
      // Sort districts by level (descending)
      const sortedDistricts = [...capitalData.districts].sort((a, b) => b.districtHallLevel - a.districtHallLevel);
      
      for (const district of sortedDistricts) {
        districtList += `**${district.name}**: Level ${district.districtHallLevel}\n`;
      }
      
      embed.addFields({ 
        name: 'Districts', 
        value: districtList || 'No districts found'
      });
    }
    
    // Add upgrade tips based on district levels
    const capitalHallLevel = capitalData.capitalHallLevel;
    const districts = capitalData.districts || [];
    
    // Find districts that are under-leveled compared to Capital Hall
    const underLeveledDistricts = districts.filter(d => 
      d.districtHallLevel < capitalHallLevel && 
      d.name !== 'Capital Hall'
    ).sort((a, b) => a.districtHallLevel - b.districtHallLevel);
    
    if (underLeveledDistricts.length > 0) {
      let tips = '';
      
      // Recommend upgrading the most under-leveled districts first
      for (let i = 0; i < Math.min(3, underLeveledDistricts.length); i++) {
        const district = underLeveledDistricts[i];
        const levelDiff = capitalHallLevel - district.districtHallLevel;
        
        tips += `**${district.name}** (Level ${district.districtHallLevel}) is ${levelDiff} level${levelDiff > 1 ? 's' : ''} behind\n`;
      }
      
      if (tips) {
        embed.addFields({ 
          name: 'Upgrade Suggestions', 
          value: tips
        });
      }
    }
    
    // Add raid weekend info
    embed.addFields({ 
      name: 'Raid Weekend API Limitations', 
      value: 'The Clash of Clans API does not provide Raid Weekend data.\nRaid information has to be checked in-game.'
    });
    
    // Add footer with timestamp
    embed.setFooter({ 
      text: `Data retrieved: ${new Date().toLocaleString()}`
    });
    
    return embed;
  }
};