// src/commands/capital/contribute.js
const { SlashCommandBuilder } = require('discord.js');
const { CapitalTracking } = require('../../models');
const { Clan, User } = require('../../models');
const { userPermission } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contribute')
    .setDescription('Track Capital Gold contributions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Record a Capital Gold contribution')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount of Capital Gold contributed')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100000))
        .addStringOption(option =>
          option.setName('player')
            .setDescription('Player tag (default: your linked account)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View Capital Gold contribution leaderboard')),
  
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
      
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'add') {
        // Get contribution amount
        const amount = interaction.options.getInteger('amount');
        
        // Get player tag
        let playerTag = interaction.options.getString('player');
        
        // If no player tag provided, try to use linked account
        if (!playerTag) {
          const user = await User.findOne({ discordId: interaction.user.id });
          
          if (!user || !user.playerTag) {
            return interaction.reply({
              content: 'You need to provide a player tag or link your account first.',
              ephemeral: true
            });
          }
          
          playerTag = user.playerTag;
        }
        
        // Format player tag
        if (!playerTag.startsWith('#')) {
          playerTag = '#' + playerTag;
        }
        playerTag = playerTag.toUpperCase();
        
        // Record contribution
        await interaction.deferReply();
        
        const success = await capitalTrackingService.trackContribution(clan.clanTag, playerTag, amount);
        
        if (success) {
          return interaction.editReply({
            content: `Successfully recorded ${amount} Capital Gold contribution.`
          });
        } else {
          return interaction.editReply({
            content: 'Failed to record contribution. Make sure the player tag is valid and try again.'
          });
        }
      } else if (subcommand === 'leaderboard') {
        // Defer reply since this might take some time
        await interaction.deferReply();
        
        // Generate and send contributions leaderboard embed
        const leaderboardEmbed = await capitalTrackingService.generateContributionsLeaderboardEmbed(clan.clanTag);
        
        return interaction.editReply({
          embeds: [leaderboardEmbed]
        });
      }
    } catch (error) {
      console.error('Error executing capital contribute command:', error);
      
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
  }
};
