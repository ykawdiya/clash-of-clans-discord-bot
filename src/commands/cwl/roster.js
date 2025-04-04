// src/commands/cwl/roster.js
const cwlTrackingService = require('../../services/cwlTrackingService');
const { Clan, User } = require('../../models');
const { userPermission } = require('../../utils/permissions');
const { command: log } = require('../../utils/logger');
const {SlashCommandBuilder} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
      .setName('roster')
      .setDescription('Manage CWL roster')
      .addSubcommand(subcommand =>
          subcommand
              .setName('view')
              .setDescription('View the current CWL roster'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('add')
              .setDescription('Add a player to the CWL roster')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag to add')
                      .setRequired(true)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('remove')
              .setDescription('Remove a player from the CWL roster')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag to remove')
                      .setRequired(true))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Check permissions for adding/removing from roster
      if ((subcommand === 'add' || subcommand === 'remove') && 
          !(await userPermission(interaction, ['Co-Leader', 'Leader']))) {
        return interaction.reply({
          content: 'You need Leader or Co-Leader role to modify the roster.',
          ephemeral: true
        });
      }
      
      // Get clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });
      
      if (!clan) {
        return interaction.reply({
          content: 'No clan linked to this server. Use /clan link first.',
          ephemeral: true
        });
      }
      
      switch (subcommand) {
        case 'view':
          await this.handleViewRoster(interaction, clan.clanTag);
          break;
        case 'add':
          await this.handleAddToRoster(interaction, clan.clanTag);
          break;
        case 'remove':
          await this.handleRemoveFromRoster(interaction, clan.clanTag);
          break;
        default:
          return interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      log.error('Error executing cwl roster command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'Error managing roster. Try again later.'
        });
      } else {
        return interaction.reply({
          content: 'Error managing roster. Try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle viewing the CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   */
  async handleViewRoster(interaction, clanTag) {
    try {
      // Defer reply as this might take time
      await interaction.deferReply();
      
      // View roster
      const result = await cwlTrackingService.viewRoster(interaction, clanTag);
      
      if (!result || !result.success) {
        return interaction.editReply({
          content: result?.message || 'There is no active CWL season.'
        });
      }
      
      return interaction.editReply({
        embeds: [result.embed]
      });
    } catch (error) {
      log.error('Error handling view roster:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle adding a player to the CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   */
  async handleAddToRoster(interaction, clanTag) {
    try {
      // Get player tag
      const playerTag = interaction.options.getString('tag');
      
      // Defer reply as this might take time
      await interaction.deferReply();
      
      // Add player to roster
      const result = await cwlTrackingService.addPlayerToRoster(interaction, clanTag, playerTag);
      
      if (!result || !result.success) {
        return interaction.editReply({
          content: result?.message || 'Failed to add player to roster. Please try again later.'
        });
      }
      
      // View updated roster
      const rosterResult = await cwlTrackingService.viewRoster(interaction, clanTag);
      
      if (rosterResult && rosterResult.success) {
        return interaction.editReply({
          content: result.message,
          embeds: [rosterResult.embed]
        });
      } else {
        return interaction.editReply({
          content: result.message
        });
      }
    } catch (error) {
      log.error('Error handling add to roster:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle removing a player from the CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   */
  async handleRemoveFromRoster(interaction, clanTag) {
    try {
      // Get player tag
      const playerTag = interaction.options.getString('tag');
      
      // Defer reply as this might take time
      await interaction.deferReply();
      
      // Remove player from roster
      const result = await cwlTrackingService.removePlayerFromRoster(interaction, clanTag, playerTag);
      
      if (!result || !result.success) {
        return interaction.editReply({
          content: result?.message || 'Failed to remove player from roster. Please try again later.'
        });
      }
      
      // View updated roster
      const rosterResult = await cwlTrackingService.viewRoster(interaction, clanTag);
      
      if (rosterResult && rosterResult.success) {
        return interaction.editReply({
          content: result.message,
          embeds: [rosterResult.embed]
        });
      } else {
        return interaction.editReply({
          content: result.message
        });
      }
    } catch (error) {
      log.error('Error handling remove from roster:', { error: error.message });
      throw error;
    }
  }
};
