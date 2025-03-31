// src/commands/clan.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('members')
        .setDescription('View clan members')
        .addStringOption(option =>
          option.setName('tag')
            .setDescription('Clan tag (default: linked clan)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('wars')
        .setDescription('View clan war statistics')
        .addStringOption(option =>
          option.setName('tag')
            .setDescription('Clan tag (default: linked clan)')
            .setRequired(false))),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'info':
          await this.handleInfo(interaction);
          break;
        case 'link':
          await this.handleLink(interaction);
          break;
        case 'members':
          await this.handleMembers(interaction);
          break;
        case 'wars':
          await this.handleWars(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      log.error('Error executing clan command:', { error: error.message });
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: 'An error occurred while processing the command. Please try again later.'
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing the command. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle clan info subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleInfo(interaction) {
    try {
      await interaction.deferReply();
      
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
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${clanData.name} [${clanData.tag}]`)
        .setDescription(clanData.description || 'No description')
        .setColor('#3498db')
        .setThumbnail(`https://cdn.clashofclans.com/badges/200/${clanData.badgeUrls.medium.split('/').pop()}`)
        .addFields(
          { name: 'Level', value: clanData.clanLevel.toString(), inline: true },
          { name: 'Location', value: clanData.location?.name || 'Not set', inline: true },
          { name: 'War League', value: clanData.warLeague?.name || 'Not placed', inline: true },
          { name: 'Members', value: `${clanData.members}/50`, inline: true },
          { name: 'War Frequency', value: clanData.warFrequency || 'Unknown', inline: true },
          { name: 'Win Streak', value: clanData.warWinStreak?.toString() || '0', inline: true },
          { name: 'War Record', value: `W: ${clanData.warWins || 0} / L: ${clanData.warLosses || 0} / D: ${clanData.warTies || 0}`, inline: false }
        );
        
      // Add clan capital info if available
      if (clanData.clanCapital) {
        embed.addFields(
          { name: 'Capital Hall', value: `Level ${clanData.clanCapital.capitalHallLevel}`, inline: true },
          { name: 'Total Districts', value: clanData.clanCapital.districts?.length?.toString() || 'Unknown', inline: true },
          { name: 'Capital League', value: clanData.capitalLeague?.name || 'Not placed', inline: true }
        );
      }
      
      // Add requirements
      embed.addFields(
        { name: 'Requirements', value: [
          `Required Trophies: ${clanData.requiredTrophies}`,
          `Required Town Hall: ${clanData.requiredTownhallLevel || 'None'}`,
          `Required Builder Trophies: ${clanData.requiredVersusTrophies || 'None'}`,
          `Type: ${clanData.type}${clanData.type !== 'open' ? ` (${clanData.labels?.map(l => l.name).join(', ') || 'No labels'})` : ''}`
        ].join('\n'), inline: false }
      );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling clan info:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle clan link subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleLink(interaction) {
    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Leader', 'Co-Leader', 'Bot Admin']);
      
      if (!hasPermission) {
        return interaction.reply({
          content: 'You need to be a Leader, Co-Leader, or Bot Admin to link a clan.',
          ephemeral: true
        });
      }
      
      await interaction.deferReply();
      
      // Get clan tag
      let clanTag = interaction.options.getString('tag');
      
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
      
      // Check if clan is already linked
      const existingClan = await Clan.findOne({ clanTag });
      
      if (existingClan && existingClan.guildId !== interaction.guild.id) {
        return interaction.editReply({
          content: 'This clan is already linked to another server.'
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
        },
        cwlStats: {
          currentLeague: clanData.warLeague?.name || 'Unknown',
          currentSeason: null,
          promotions: 0,
          demotions: 0,
          bestPosition: null
        },
        capitalStats: {
          raidMedalsEarned: 0,
          capitalGoldContributed: 0,
          districtsMaxed: 0
        }
      });
      
      await newClan.save();
      
      return interaction.editReply({
        content: `Successfully linked ${clanData.name} (${clanTag}) to this server!`
      });
    } catch (error) {
      log.error('Error handling clan link:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle clan members subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleMembers(interaction) {
    try {
      await interaction.deferReply();
      
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
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${clanData.name} - Members (${clanData.members}/50)`)
        .setColor('#3498db')
        .setThumbnail(`https://cdn.clashofclans.com/badges/200/${clanData.badgeUrls.medium.split('/').pop()}`);
        
      // Sort members by roles and then level
      const sortedMembers = [...clanData.memberList].sort((a, b) => {
        const roleOrder = { leader: 0, coLeader: 1, admin: 2, member: 3 };
        
        if (a.role !== b.role) {
          return roleOrder[a.role] - roleOrder[b.role];
        }
        
        return b.expLevel - a.expLevel;
      });
      
      // Group members by role
      const groupedMembers = {
        leader: sortedMembers.filter(m => m.role === 'leader'),
        coLeader: sortedMembers.filter(m => m.role === 'coLeader'),
        admin: sortedMembers.filter(m => m.role === 'admin'),
        member: sortedMembers.filter(m => m.role === 'member')
      };
      
      // Add fields for each role group
      if (groupedMembers.leader.length > 0) {
        embed.addFields({
          name: '👑 Leader',
          value: groupedMembers.leader.map(m => `${m.name} (TH${m.townhallLevel})`).join('\n')
        });
      }
      
      if (groupedMembers.coLeader.length > 0) {
        embed.addFields({
          name: '⭐ Co-Leaders',
          value: groupedMembers.coLeader.map(m => `${m.name} (TH${m.townhallLevel})`).join('\n')
        });
      }
      
      if (groupedMembers.admin.length > 0) {
        embed.addFields({
          name: '🔶 Elders',
          value: groupedMembers.admin.map(m => `${m.name} (TH${m.townhallLevel})`).join('\n')
        });
      }
      
      if (groupedMembers.member.length > 0) {
        // Split members into chunks if there are too many
        const memberChunks = [];
        for (let i = 0; i < groupedMembers.member.length; i += 20) {
          memberChunks.push(groupedMembers.member.slice(i, i + 20));
        }
        
        for (let i = 0; i < memberChunks.length; i++) {
          embed.addFields({
            name: i === 0 ? '👤 Members' : '\u200B', // Empty name for continuation fields
            value: memberChunks[i].map(m => `${m.name} (TH${m.townhallLevel})`).join('\n')
          });
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling clan members:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle clan wars subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleWars(interaction) {
    try {
      await interaction.deferReply();
      
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
        
        // If we have war stats in database, use those
        if (clan.warStats) {
          const embed = new EmbedBuilder()
            .setTitle(`${clan.name} - War Statistics`)
            .setColor('#3498db')
            .addFields(
              { name: 'Regular War Record', value: `Wins: ${clan.warStats.wins}\nLosses: ${clan.warStats.losses}\nTies: ${clan.warStats.ties}`, inline: true },
              { name: 'Win Rate', value: `${((clan.warStats.wins / Math.max(1, clan.warStats.wins + clan.warStats.losses + clan.warStats.ties)) * 100).toFixed(2)}%`, inline: true },
              { name: 'Win Streak', value: `Current: ${clan.warStats.currentWinStreak}\nBest: ${clan.warStats.winStreak}`, inline: true }
            );
            
          // Add CWL stats if available
          if (clan.cwlStats?.currentLeague) {
            embed.addFields(
              { name: 'CWL League', value: clan.cwlStats.currentLeague, inline: true },
              { name: 'CWL History', value: `Promotions: ${clan.cwlStats.promotions}\nDemotions: ${clan.cwlStats.demotions}`, inline: true }
            );
          }
          
          return interaction.editReply({ embeds: [embed] });
        }
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
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${clanData.name} - War Statistics`)
        .setColor('#3498db')
        .setThumbnail(`https://cdn.clashofclans.com/badges/200/${clanData.badgeUrls.medium.split('/').pop()}`);
        
      // Add war stats
      const wars = clanData.warWins || 0;
      const losses = clanData.warLosses || 0;
      const ties = clanData.warTies || 0;
      const total = Math.max(1, wars + losses + ties);
      const winRate = (wars / total) * 100;
      
      embed.addFields(
        { name: 'Regular War Record', value: `Wins: ${wars}\nLosses: ${losses}\nTies: ${ties}`, inline: true },
        { name: 'Win Rate', value: `${winRate.toFixed(2)}%`, inline: true },
        { name: 'Win Streak', value: clanData.warWinStreak?.toString() || '0', inline: true }
      );
      
      // Add CWL league if available
      if (clanData.warLeague) {
        embed.addFields(
          { name: 'CWL League', value: clanData.warLeague.name, inline: true }
        );
      }
      
      // Add current war status if the clan is linked
      const clan = await Clan.findOne({ clanTag });
      
      if (clan && clan.guildId === interaction.guild.id) {
        // Get current war status
        try {
          const warData = await clashApiService.getCurrentWar(clanTag);
          
          if (warData && warData.state !== 'notInWar') {
            embed.addFields(
              { name: 'Current War Status', value: `State: ${warData.state}\nOpponent: ${warData.opponent?.name || 'Unknown'}\nSize: ${warData.teamSize}v${warData.teamSize}`, inline: false }
            );
          } else {
            embed.addFields(
              { name: 'Current War Status', value: 'Not in war', inline: false }
            );
          }
        } catch (error) {
          log.error('Error getting current war:', { error: error.message });
          // Continue without war status
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling clan wars:', { error: error.message });
      throw error;
    }
  }
};
