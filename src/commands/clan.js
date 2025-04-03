// src/commands/clan.js (Enhanced but safe)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Clan, User } = require('../models');
const clashApiService = require('../services/clashApiService');
const { userPermission } = require('../utils/permissions');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('clan')
      .setDescription('Clan information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('Get basic clan information')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag (default: linked clan)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('link')
              .setDescription('Link a clan to this server')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag')
                      .setRequired(true))),

  async execute(interaction) {
    // Don't defer reply right away - do it only in the specific handlers where needed
    try {
      const subcommand = interaction.options.getSubcommand();

      // Route to appropriate handler
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
      log.error('Error executing clan command:', { error: error.message });

      // Only reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        }).catch(e => {
          log.error('Failed to send error response:', { error: e.message });
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing the command.'
        }).catch(e => {
          log.error('Failed to edit deferred reply:', { error: e.message });
        });
      }
    }
  },

  async handleInfo(interaction) {
    await interaction.deferReply(); // We'll defer here because we'll make API calls

    try {
      // Get clan tag
      let clanTag = interaction.options.getString('tag');

      if (!clanTag) {
        // Use linked clan if no tag provided
        const clan = await Clan.findOne({ guildId: interaction.guild.id });

        if (!clan) {
          return interaction.editReply({
            content: 'No clan linked to this server. Please provide a clan tag or link a clan first.'
          });
        }

        clanTag = clan.clanTag;
      }

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();

      // Get clan data from API
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for clan "${clanTag}" from the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }

      // Create embed
      const embed = new EmbedBuilder()
          .setTitle(`${clanData.name} [${clanData.tag}]`)
          .setDescription(clanData.description || 'No description')
          .setColor('#3498db');

      // Add basic clan info
      embed.addFields(
          { name: 'Level', value: clanData.clanLevel.toString(), inline: true },
          { name: 'Members', value: `${clanData.members}/50`, inline: true },
          { name: 'War League', value: clanData.warLeague?.name || 'Not placed', inline: true }
      );

      if (clanData.warWins) {
        embed.addFields(
            { name: 'War Record', value: `Wins: ${clanData.warWins || 0}`, inline: true }
        );
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling clan info:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving clan information. Please try again later.' });
    }
  },

  async handleLink(interaction) {
    await interaction.deferReply(); // We'll defer here because we'll make API calls

    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Leader', 'Co-Leader', 'Bot Admin']);

      if (!hasPermission) {
        return interaction.editReply({
          content: 'You need to be a Leader, Co-Leader, or Bot Admin to link a clan.'
        });
      }

      // Get clan tag
      let clanTag = interaction.options.getString('tag');

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();
      
      // Get clan data from API (now with fallback mechanisms)
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to verify clan "${clanTag}" with the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }

      // Check if server already has a linked clan
      const currentClan = await Clan.findOne({ guildId: interaction.guild.id });

      if (currentClan) {
        // Update existing clan
        currentClan.clanTag = clanTag;
        currentClan.name = clanData.name;
        currentClan.level = clanData.clanLevel;

        await currentClan.save();

        return interaction.editReply({
          content: `Updated linked clan to ${clanData.name} (${clanTag}).`
        });
      }

      // Create new clan
      const newClan = new Clan({
        clanTag,
        guildId: interaction.guild.id,
        name: clanData.name,
        level: clanData.clanLevel,
        warStats: {
          wins: clanData.warWins || 0,
          losses: clanData.warLosses || 0,
          ties: clanData.warTies || 0,
          winStreak: clanData.warWinStreak || 0,
          currentWinStreak: clanData.warWinStreak || 0
        }
      });

      await newClan.save();

      return interaction.editReply({
        content: `Successfully linked ${clanData.name} (${clanTag}) to this server!`
      });
    } catch (error) {
      log.error('Error handling clan link:', { error: error.message });
      return interaction.editReply({ content: 'Error linking clan. Please try again later.' });
    }
  }
};