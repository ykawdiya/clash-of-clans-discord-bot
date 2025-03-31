// src/commands/admin/setup.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { system: log } = require('../../utils/logger');
const Clan = require('../../models/Clan');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up server for optimal bot usage')
    .addSubcommand(subcommand =>
      subcommand
        .setName('single')
        .setDescription('Set up server for single clan'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('multi')
        .setDescription('Set up server for multiple clans')
        .addIntegerOption(option =>
          option.setName('count')
            .setDescription('Number of clans (2-5)')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(5)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Defer reply as this operation might take time
      await interaction.deferReply();
      
      if (subcommand === 'single') {
        await this.setupSingleClan(interaction);
      } else if (subcommand === 'multi') {
        const clanCount = interaction.options.getInteger('count');
        await this.setupMultiClan(interaction, clanCount);
      }
    } catch (error) {
      log.error('Error executing setup command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred during setup. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred during setup. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Set up server for single clan
   * @param {Interaction} interaction - Discord interaction
   */
  async setupSingleClan(interaction) {
    try {
      const guild = interaction.guild;
      const botMember = guild.members.cache.get(guild.client.user.id);
      
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
          content: 'I need the "Manage Channels" permission to set up the server.'
        });
      }
      
      // Create categories and channels
      const categories = [
        { name: 'GENERAL', channels: [
          { name: 'welcome-info', type: 'GUILD_TEXT' },
          { name: 'rules', type: 'GUILD_TEXT' },
          { name: 'announcements', type: 'GUILD_TEXT' },
          { name: 'bot-commands', type: 'GUILD_TEXT' }
        ]},
        { name: 'WAR CENTER', channels: [
          { name: 'war-status', type: 'GUILD_TEXT' },
          { name: 'war-planning', type: 'GUILD_TEXT' },
          { name: 'base-calling', type: 'GUILD_TEXT' },
          { name: 'attack-tracker', type: 'GUILD_TEXT' },
          { name: 'war-history', type: 'GUILD_TEXT' }
        ]},
        { name: 'CWL CENTER', channels: [
          { name: 'cwl-announcements', type: 'GUILD_TEXT' },
          { name: 'cwl-roster', type: 'GUILD_TEXT' },
          { name: 'daily-matchups', type: 'GUILD_TEXT' },
          { name: 'medal-tracking', type: 'GUILD_TEXT' }
        ]},
        { name: 'CLAN CAPITAL', channels: [
          { name: 'capital-status', type: 'GUILD_TEXT' },
          { name: 'raid-weekends', type: 'GUILD_TEXT' },
          { name: 'contribution-tracker', type: 'GUILD_TEXT' },
          { name: 'upgrade-planning', type: 'GUILD_TEXT' }
        ]},
        { name: 'CLAN MANAGEMENT', channels: [
          { name: 'member-stats', type: 'GUILD_TEXT' },
          { name: 'clan-games', type: 'GUILD_TEXT' },
          { name: 'activity-tracking', type: 'GUILD_TEXT' },
          { name: 'member-roles', type: 'GUILD_TEXT' }
        ]},
        { name: 'COMMUNITY', channels: [
          { name: 'general-chat', type: 'GUILD_TEXT' },
          { name: 'clash-discussion', type: 'GUILD_TEXT' },
          { name: 'off-topic', type: 'GUILD_TEXT' }
        ]}
      ];
      
      // Create categories and channels
      const createdCategories = [];
      
      for (const category of categories) {
        // Create category
        const createdCategory = await guild.channels.create({
          name: category.name,
          type: 0, // GUILD_CATEGORY
          reason: 'Server setup for Clash of Clans bot'
        });
        
        createdCategories.push(createdCategory);
        
        // Create channels in category
        for (const channel of category.channels) {
          await guild.channels.create({
            name: channel.name,
            type: 0, // GUILD_TEXT
            parent: createdCategory.id,
            reason: 'Server setup for Clash of Clans bot'
          });
        }
      }
      
      // Create roles if they don't exist
      const roles = ['Leader', 'Co-Leader', 'Elder', 'Member', 'Bot Admin'];
      
      for (const roleName of roles) {
        if (!guild.roles.cache.some(role => role.name === roleName)) {
          await guild.roles.create({
            name: roleName,
            reason: 'Server setup for Clash of Clans bot'
          });
        }
      }
      
      // Update response with setup completion
      return interaction.editReply({
        content: 'Server setup for single clan completed! Created:\n' +
                 `- ${categories.length} categories\n` +
                 `- ${categories.reduce((count, cat) => count + cat.channels.length, 0)} channels\n` +
                 `- Verified/created ${roles.length} roles\n\n` +
                 'Next steps: \n' +
                 '1. Link your clan using `/clan link [clan tag]`\n' +
                 '2. Set up channel permissions as needed\n' +
                 '3. Start using war, cwl, and capital commands!'
      });
    } catch (error) {
      log.error('Error setting up single clan server:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Set up server for multiple clans
   * @param {Interaction} interaction - Discord interaction
   * @param {Number} clanCount - Number of clans
   */
  async setupMultiClan(interaction, clanCount) {
    try {
      const guild = interaction.guild;
      const botMember = guild.members.cache.get(guild.client.user.id);
      
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
          content: 'I need the "Manage Channels" permission to set up the server.'
        });
      }
      
      // Create categories and channels
      const categories = [
        { name: 'GENERAL', channels: [
          { name: 'welcome-info', type: 'GUILD_TEXT' },
          { name: 'rules', type: 'GUILD_TEXT' },
          { name: 'announcements', type: 'GUILD_TEXT' },
          { name: 'bot-commands', type: 'GUILD_TEXT' }
        ]},
        { name: 'CLAN HUB', channels: [
          { name: 'clan-directory', type: 'GUILD_TEXT' },
          { name: 'clan-requirements', type: 'GUILD_TEXT' },
          { name: 'move-requests', type: 'GUILD_TEXT' }
        ]},
        { name: 'WAR CENTER', channels: [
          { name: 'war-announcements', type: 'GUILD_TEXT' },
          ...Array.from({ length: clanCount }, (_, i) => ({ name: `clan${i+1}-war`, type: 'GUILD_TEXT' })),
          { name: 'war-stats', type: 'GUILD_TEXT' }
        ]},
        { name: 'CWL CENTER', channels: [
          { name: 'cwl-announcements', type: 'GUILD_TEXT' },
          ...Array.from({ length: clanCount }, (_, i) => ({ name: `clan${i+1}-cwl`, type: 'GUILD_TEXT' })),
          { name: 'cwl-roster-planning', type: 'GUILD_TEXT' }
        ]},
        { name: 'CLAN CAPITAL', channels: [
          { name: 'capital-status', type: 'GUILD_TEXT' },
          ...Array.from({ length: clanCount }, (_, i) => ({ name: `clan${i+1}-capital`, type: 'GUILD_TEXT' })),
          { name: 'raid-weekend-hub', type: 'GUILD_TEXT' }
        ]},
        { name: 'LEADERSHIP', channels: [
          { name: 'admin-commands', type: 'GUILD_TEXT' },
          { name: 'family-planning', type: 'GUILD_TEXT' },
          { name: 'member-management', type: 'GUILD_TEXT' },
          { name: 'metrics-reporting', type: 'GUILD_TEXT' }
        ]},
        { name: 'COMMUNITY', channels: [
          { name: 'general-chat', type: 'GUILD_TEXT' },
          { name: 'clash-discussion', type: 'GUILD_TEXT' },
          { name: 'off-topic', type: 'GUILD_TEXT' }
        ]}
      ];
      
      // Create clan-specific categories
      for (let i = 1; i <= clanCount; i++) {
        categories.push({
          name: `CLAN ${i}`,
          channels: [
            { name: `clan${i}-announcements`, type: 'GUILD_TEXT' },
            { name: `clan${i}-chat`, type: 'GUILD_TEXT' },
            { name: `clan${i}-planning`, type: 'GUILD_TEXT' }
          ]
        });
      }
      
      // Create categories and channels
      const createdCategories = [];
      
      for (const category of categories) {
        // Create category
        const createdCategory = await guild.channels.create({
          name: category.name,
          type: 0, // GUILD_CATEGORY
          reason: 'Server setup for Clash of Clans bot (multi-clan)'
        });
        
        createdCategories.push(createdCategory);
        
        // Create channels in category
        for (const channel of category.channels) {
          await guild.channels.create({
            name: channel.name,
            type: 0, // GUILD_TEXT
            parent: createdCategory.id,
            reason: 'Server setup for Clash of Clans bot (multi-clan)'
          });
        }
      }
      
      // Create roles if they don't exist
      const roles = ['Leader', 'Co-Leader', 'Elder', 'Member', 'Visitor', 'Bot Admin'];
      
      // Create clan-specific roles
      for (let i = 1; i <= clanCount; i++) {
        roles.push(`Clan ${i} Leader`);
        roles.push(`Clan ${i} Member`);
      }
      
      for (const roleName of roles) {
        if (!guild.roles.cache.some(role => role.name === roleName)) {
          await guild.roles.create({
            name: roleName,
            reason: 'Server setup for Clash of Clans bot (multi-clan)'
          });
        }
      }
      
      // Update response with setup completion
      return interaction.editReply({
        content: `Server setup for ${clanCount} clans completed! Created:\n` +
                 `- ${categories.length} categories\n` +
                 `- ${categories.reduce((count, cat) => count + cat.channels.length, 0)} channels\n` +
                 `- Verified/created ${roles.length} roles\n\n` +
                 'Next steps: \n' +
                 '1. Link your clans using `/clan link [clan tag]`\n' +
                 '2. Set up channel permissions for each clan\n' +
                 '3. Start using war, cwl, and capital commands!'
      });
    } catch (error) {
      log.error('Error setting up multi-clan server:', { error: error.message });
      throw error;
    }
  }
};
