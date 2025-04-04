// src/commands/player.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../models');
const clashApiService = require('../services/clashApiService');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('player')
      .setDescription('Player information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('View player information')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag (if not viewing your own profile)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('link')
              .setDescription('Link your Clash of Clans account')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag')
                      .setRequired(true))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'info') {
        await this.handleInfo(interaction);
      }
      else if (subcommand === 'link') {
        await this.handleLink(interaction);
      }
      else {
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
      }
    } catch (error) {
      log.error('Error executing player command:', { error: error.message });

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        }).catch(e => {
          log.error(`Failed to send error response:`, { error: e.message });
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing the command.'
        }).catch(e => {
          log.error(`Failed to edit deferred reply:`, { error: e.message });
        });
      }
    }
  },

  async handleInfo(interaction) {
    await interaction.deferReply(); // Defer reply since we'll make API calls

    try {
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // If no tag provided, check if user has a linked account
      if (!playerTag) {
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (user && user.playerTag) {
          playerTag = user.playerTag;
        } else {
          return interaction.editReply({
            content: 'You have no linked Clash of Clans account. Please provide a player tag or link your account first using `/player link <tag>`'
          });
        }
      }
      
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Get player data from API
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        return interaction.editReply({
          content: 'Player not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for player "${playerTag}" from the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Create embed
      const embed = new EmbedBuilder()
          .setTitle(`${playerData.name} [${playerData.tag}]`)
          .setColor('#3498db');
      
      // Add basic player info
      embed.addFields(
          { name: 'TH Level', value: playerData.townHallLevel.toString(), inline: true },
          { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
          { name: 'Exp Level', value: playerData.expLevel.toString(), inline: true }
      );
      
      // Add clan info if available
      if (playerData.clan) {
        embed.addFields(
            { name: 'Clan', value: `${playerData.clan.name} [${playerData.clan.tag}]`, inline: true },
            { name: 'Role', value: playerData.role.charAt(0).toUpperCase() + playerData.role.slice(1), inline: true }
        );
      } else {
        embed.addFields({ name: 'Clan', value: 'No Clan', inline: true });
      }
      
      // Add achievements
      if (playerData.achievements) {
        const warStars = playerData.achievements.find(a => a.name === 'War Hero');
        if (warStars) {
          embed.addFields({ name: 'War Stars', value: warStars.value.toString(), inline: true });
        }
      }
      
      // Add attack/defense stats
      embed.addFields(
          { name: 'Attack Wins', value: playerData.attackWins?.toString() || '0', inline: true },
          { name: 'Defense Wins', value: playerData.defenseWins?.toString() || '0', inline: true }
      );
      
      // Add player avatar if available
      if (playerData.league && playerData.league.iconUrls && playerData.league.iconUrls.medium) {
        embed.setThumbnail(playerData.league.iconUrls.medium);
      }
      
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling player info:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving player information. Please try again later.' });
    }
  },

  async handleLink(interaction) {
    await interaction.deferReply(); // Defer reply since we'll make API calls
    
    try {
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Get player data from API
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        return interaction.editReply({
          content: 'Player not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to verify player "${playerTag}" with the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Check if player is already linked to another Discord user
      const existingUser = await User.findOne({ playerTag });
      
      if (existingUser && existingUser.discordId !== interaction.user.id) {
        return interaction.editReply({
          content: `This player is already linked to another Discord user. If this is your account, please contact a server administrator.`
        });
      }
      
      // Check if the current user already has a linked account
      let user = await User.findOne({ discordId: interaction.user.id });
      
      if (user) {
        // Update existing user
        user.playerTag = playerTag;
        user.playerName = playerData.name;
        user.townHallLevel = playerData.townHallLevel;
        user.discordUsername = interaction.user.username;
      } else {
        // Create new user
        user = new User({
          discordId: interaction.user.id,
          discordUsername: interaction.user.username,
          playerTag: playerTag,
          playerName: playerData.name,
          townHallLevel: playerData.townHallLevel
        });
      }
      
      await user.save();
      
      return interaction.editReply({
        content: `Successfully linked your Discord account to ${playerData.name} (${playerTag}). You can now use player-specific features!`
      });
    } catch (error) {
      log.error('Error handling player link:', { error: error.message });
      return interaction.editReply({ content: 'Error linking player. Please try again later.' });
    }
  }
};