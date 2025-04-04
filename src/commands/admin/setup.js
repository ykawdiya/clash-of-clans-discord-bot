// src/commands/admin/setup.js
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { system: log } = require('../../utils/logger');
const { Clan, User } = require('../../models');
const clashApiService = require('../../services/clashApiService');

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
    .addSubcommand(subcommand =>
      subcommand
        .setName('wizard')
        .setDescription('Interactive setup wizard for your server'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Handle wizard subcommand differently
      if (subcommand === 'wizard') {
        return this.startSetupWizard(interaction);
      }
      
      // Defer reply as other operations might take time
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
   * Start the interactive setup wizard
   * @param {Interaction} interaction - Discord interaction
   */
  async startSetupWizard(interaction) {
    try {
      // Check if we have necessary permissions
      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) ||
          !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          content: 'I need the "Manage Channels" and "Manage Roles" permissions to run the setup wizard.',
          ephemeral: true
        });
      }
      
      // Create the welcome embed
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🛠️ Clash of Clans Server Setup Wizard')
        .setDescription('Welcome to the setup wizard! This tool will help you configure your Discord server for optimal use with the Clash of Clans bot.')
        .setColor('#f1c40f')
        .addFields(
          { name: 'What can this wizard do?', value: '• Create organized channels and categories\n• Set up roles based on clan ranks\n• Configure notification preferences\n• Prepare your server for war tracking and more' },
          { name: 'Getting Started', value: 'Choose what you want to set up below:' }
        );
        
      // Create the buttons for options
      const setupButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('setup_channels')
            .setLabel('Channels & Categories')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📁'),
          new ButtonBuilder()
            .setCustomId('setup_roles')
            .setLabel('Roles & Permissions')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👑'),
          new ButtonBuilder()
            .setCustomId('setup_notifications')
            .setLabel('Notifications')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔔')
        );
        
      const allInOneButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('setup_all')
            .setLabel('Complete Server Setup')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
        );
        
      await interaction.reply({
        embeds: [welcomeEmbed],
        components: [setupButtons, allInOneButton],
        ephemeral: true
      });
    } catch (error) {
      log.error('Error starting setup wizard:', { error: error.message });
      return interaction.reply({
        content: 'An error occurred while starting the setup wizard. Please try again later.',
        ephemeral: true
      });
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
      const createdChannels = {};
      
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
          const createdChannel = await guild.channels.create({
            name: channel.name,
            type: 0, // GUILD_TEXT
            parent: createdCategory.id,
            reason: 'Server setup for Clash of Clans bot'
          });
          
          // Store created channels by name for later use
          createdChannels[channel.name] = createdChannel;
        }
      }
      
      // Create roles if they don't exist
      const roles = ['Leader', 'Co-Leader', 'Elder', 'Member', 'Bot Admin'];
      const createdRoles = [];
      
      for (const roleName of roles) {
        if (!guild.roles.cache.some(role => role.name === roleName)) {
          const role = await guild.roles.create({
            name: roleName,
            reason: 'Server setup for Clash of Clans bot'
          });
          createdRoles.push(role);
        }
      }
      
      // Add welcome messages to appropriate channels
      try {
        // Get linked clan if exists
        const clan = await Clan.findOne({ guildId: guild.id });
        let clanName = null;
        let clanTag = null;
        
        if (clan) {
          try {
            const clanData = await clashApiService.getClan(clan.clanTag);
            if (clanData && !clanData.isPlaceholder) {
              clanName = clanData.name;
              clanTag = clanData.tag;
            }
          } catch (error) {
            log.warn('Could not fetch clan data for welcome message:', { error: error.message });
          }
        }
        
        // Add welcome message
        if (createdChannels['welcome-info']) {
          await this.createWelcomeMessage(createdChannels['welcome-info'], clanName, clanTag);
        }
        
        // Add rules template
        if (createdChannels['rules']) {
          const rulesEmbed = new EmbedBuilder()
            .setTitle('Server Rules')
            .setDescription('Please follow these rules to maintain a positive community environment.')
            .setColor('#e74c3c')
            .addFields(
              { name: '1. Be Respectful', value: 'Treat all members with respect. No harassment, hate speech, or bullying.' },
              { name: '2. Keep it Clean', value: 'No NSFW content, excessive profanity, or inappropriate discussions.' },
              { name: '3. No Spamming', value: 'Avoid excessive messages, emotes, or mentions.' },
              { name: '4. Follow Discord TOS', value: 'Adhere to Discord\'s Terms of Service and Community Guidelines.' },
              { name: '5. Clan-Specific Rules', value: 'Additional rules specific to our clan will be posted by leadership.' }
            );
          
          await createdChannels['rules'].send({ embeds: [rulesEmbed] });
        }
        
        // Add bot info to commands channel
        if (createdChannels['bot-commands']) {
          const commandsEmbed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setDescription('Use these commands to interact with the Clash of Clans bot.')
            .setColor('#3498db')
            .addFields(
              { name: 'Getting Started', value: '`/help` - View available commands\n`/player link [tag]` - Link your CoC account\n`/clan info` - View clan information' },
              { name: 'War Commands', value: '`/war status` - Check current war status\n`/war call [position]` - Call a base for attack\n`/war map` - View current war map' },
              { name: 'CWL Commands', value: '`/cwl status` - Check CWL status\n`/cwl roster` - View CWL roster\n`/cwl medals` - Calculate expected medals' },
              { name: 'Clan Capital', value: '`/capital status` - View capital status\n`/capital raids` - Check raid weekend progress\n`/capital contribute` - Track contributions' }
            );
          
          await createdChannels['bot-commands'].send({ embeds: [commandsEmbed] });
        }
      } catch (error) {
        log.error('Error creating welcome messages:', { error: error.message });
        // Continue setup process even if welcome messages fail
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
      const createdChannels = {};
      
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
          const createdChannel = await guild.channels.create({
            name: channel.name,
            type: 0, // GUILD_TEXT
            parent: createdCategory.id,
            reason: 'Server setup for Clash of Clans bot (multi-clan)'
          });
          
          // Store created channels by name for later use
          createdChannels[channel.name] = createdChannel;
        }
      }
      
      // Create roles if they don't exist
      const roles = ['Leader', 'Co-Leader', 'Elder', 'Member', 'Visitor', 'Bot Admin'];
      const createdRoles = [];
      
      // Create clan-specific roles
      for (let i = 1; i <= clanCount; i++) {
        roles.push(`Clan ${i} Leader`);
        roles.push(`Clan ${i} Member`);
      }
      
      for (const roleName of roles) {
        if (!guild.roles.cache.some(role => role.name === roleName)) {
          const role = await guild.roles.create({
            name: roleName,
            reason: 'Server setup for Clash of Clans bot (multi-clan)'
          });
          createdRoles.push(role);
        }
      }
      
      // Add welcome messages to appropriate channels
      try {
        // Add welcome message
        if (createdChannels['welcome-info']) {
          // For multi-clan setup, we use a general welcome without a specific clan
          const welcomeEmbed = new EmbedBuilder()
            .setTitle('Welcome to Clan Family Discord!')
            .setDescription('This server is set up to manage multiple Clash of Clans clans.')
            .setColor('#f1c40f')
            .addFields(
              { name: 'Getting Started', value: 'Use `/help` to see available commands' },
              { name: 'Link Your Account', value: 'Use `/player link [your-tag]` to link your CoC account' },
              { name: 'Server Structure', value: 'This server has dedicated channels for each clan, plus shared war, CWL, and capital tracking.' }
            );
          
          await createdChannels['welcome-info'].send({ embeds: [welcomeEmbed] });
        }
        
        // Add clan directory info
        if (createdChannels['clan-directory']) {
          const directoryEmbed = new EmbedBuilder()
            .setTitle('Clan Family Directory')
            .setDescription('Below is information about all clans in our family.')
            .setColor('#2ecc71')
            .addFields(
              { name: 'Linking Clans', value: 'Admins: Use `/clan link [tag]` to link each clan' },
              { name: 'Viewing Clan Info', value: 'Members: Use `/clan info` to see details about any linked clan' }
            );
          
          for (let i = 1; i <= clanCount; i++) {
            directoryEmbed.addFields({
              name: `Clan ${i}`,
              value: 'Use `/clan link [tag]` to set clan information'
            });
          }
          
          await createdChannels['clan-directory'].send({ embeds: [directoryEmbed] });
        }
        
        // Add rules template
        if (createdChannels['rules']) {
          const rulesEmbed = new EmbedBuilder()
            .setTitle('Server Rules')
            .setDescription('Please follow these rules to maintain a positive community environment.')
            .setColor('#e74c3c')
            .addFields(
              { name: '1. Be Respectful', value: 'Treat all members with respect. No harassment, hate speech, or bullying.' },
              { name: '2. Keep it Clean', value: 'No NSFW content, excessive profanity, or inappropriate discussions.' },
              { name: '3. No Spamming', value: 'Avoid excessive messages, emotes, or mentions.' },
              { name: '4. Follow Discord TOS', value: 'Adhere to Discord\'s Terms of Service and Community Guidelines.' },
              { name: '5. Clan Family Rules', value: 'Use the appropriate clan channels. Respect leadership decisions.' }
            );
          
          await createdChannels['rules'].send({ embeds: [rulesEmbed] });
        }
        
        // Add bot info to commands channel
        if (createdChannels['bot-commands']) {
          const commandsEmbed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setDescription('Use these commands to interact with the Clash of Clans bot.')
            .setColor('#3498db')
            .addFields(
              { name: 'Getting Started', value: '`/help` - View available commands\n`/player link [tag]` - Link your CoC account\n`/clan info [tag]` - View clan information' },
              { name: 'War Commands', value: '`/war status [tag]` - Check war status for a specific clan\n`/war map [tag]` - View current war map' },
              { name: 'CWL Commands', value: '`/cwl status [tag]` - Check CWL status\n`/cwl roster [tag]` - View CWL roster' },
              { name: 'Clan Capital', value: '`/capital status [tag]` - View capital status\n`/capital raids [tag]` - Check raid weekend progress' }
            );
          
          await createdChannels['bot-commands'].send({ embeds: [commandsEmbed] });
        }
      } catch (error) {
        log.error('Error creating multi-clan welcome messages:', { error: error.message });
        // Continue setup process even if welcome messages fail
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
  },
  
  /**
   * Channel setup handler for the setup wizard
   * @param {Interaction} interaction - Discord interaction
   */
  async handleChannels(interaction) {
    try {
      // Create a select menu for channel setup options
      const channelSetupMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('channel_setup')
            .setPlaceholder('Select channel setup option')
            .addOptions([
              {
                label: 'Standard Channels',
                description: 'Create default channels for a single clan',
                value: 'default_channels',
                emoji: '📋'
              },
              {
                label: 'Custom Channels',
                description: 'Select specific channels to create',
                value: 'custom_channels',
                emoji: '🔧'
              },
              {
                label: 'Clan Family Setup',
                description: 'Create channels for multiple clans',
                value: 'family_channels',
                emoji: '👪'
              }
            ])
        );
      
      // Create an embed to explain the options
      const channelEmbed = new EmbedBuilder()
        .setTitle('Channel & Category Setup')
        .setDescription('Select which type of channel setup you want to create:')
        .setColor('#3498db')
        .addFields(
          { name: 'Standard Setup', value: 'Creates a complete set of channels for a single clan, including war, CWL, and clan capital sections.' },
          { name: 'Custom Setup', value: 'Lets you choose which specific channels to create based on your needs.' },
          { name: 'Clan Family Setup', value: 'Creates a comprehensive structure for managing multiple clans with shared resources and clan-specific areas.' }
        );
      
      await interaction.update({
        embeds: [channelEmbed],
        components: [channelSetupMenu],
        ephemeral: true
      });
    } catch (error) {
      log.error('Error handling channel setup:', { error: error.message });
      await interaction.update({
        content: 'An error occurred while setting up channels. Please try again later.',
        components: [],
        ephemeral: true
      });
    }
  },
  
  /**
   * Role setup handler for the setup wizard
   * @param {Interaction} interaction - Discord interaction
   */
  async handleRoles(interaction) {
    try {
      // Check if we have manage roles permission
      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.update({
          content: 'I need the "Manage Roles" permission to set up roles.',
          components: [],
          ephemeral: true
        });
      }
      
      // Get clan data if available
      let clanData = null;
      const clan = await Clan.findOne({ guildId: interaction.guild.id });
      
      if (clan) {
        try {
          clanData = await clashApiService.getClan(clan.clanTag);
        } catch (error) {
          log.warn('Could not fetch clan data for role setup:', { error: error.message });
          // Continue without clan data
        }
      }
      
      // Create embed with role information
      const roleEmbed = new EmbedBuilder()
        .setTitle('Role Setup')
        .setDescription('Create and configure roles for your Clash of Clans server')
        .setColor('#9b59b6')
        .addFields(
          { name: 'Standard Roles', value: 'Create basic roles for clan hierarchy (Leader, Co-Leader, Elder, Member)' },
          { name: 'Role Synchronization', value: clanData ? `Sync roles with ${clanData.name} clan ranks` : 'Link a clan first to enable role sync' }
        );
      
      // Create buttons for role options
      const roleButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_roles')
            .setLabel('Create Standard Roles')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId('sync_members')
            .setLabel('Sync Member Roles')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄')
            .setDisabled(!clanData) // Disable if no clan data
        );
      
      const cancelButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('cancel_setup')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );
      
      await interaction.update({
        embeds: [roleEmbed],
        components: [roleButtons, cancelButton],
        ephemeral: true
      });
    } catch (error) {
      log.error('Error handling role setup:', { error: error.message });
      await interaction.update({
        content: 'An error occurred while setting up roles. Please try again later.',
        components: [],
        ephemeral: true
      });
    }
  },
  
  /**
   * Notification setup handler for the setup wizard
   * @param {Interaction} interaction - Discord interaction
   */
  async handleNotifications(interaction) {
    try {
      // Create embed explaining notification setup
      const notificationEmbed = new EmbedBuilder()
        .setTitle('Notification Setup')
        .setDescription('Configure which types of notifications you want to enable for your server')
        .setColor('#2ecc71')
        .addFields(
          { name: 'Available Notifications', value: '• War start/end notifications\n• CWL updates\n• Member activity tracking\n• Welcome messages\n• Automated reminders' },
          { name: 'Setup Process', value: 'Select the notification types you want to enable below. You can configure detailed settings for each type later.' }
        );
      
      // Create select menu for notification options
      const notificationMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('notification_setup')
            .setPlaceholder('Select notification types')
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions([
              {
                label: 'War Notifications',
                description: 'Get notified when wars start and end',
                value: 'war_notifications',
                emoji: '⚔️'
              },
              {
                label: 'CWL Updates',
                description: 'Daily updates during Clan War League',
                value: 'cwl_notifications',
                emoji: '🏆'
              },
              {
                label: 'Member Activity',
                description: 'Track member donations and activity',
                value: 'activity_notifications',
                emoji: '📊'
              },
              {
                label: 'Welcome Messages',
                description: 'Automatic messages for new members',
                value: 'welcome_notifications',
                emoji: '👋'
              },
              {
                label: 'Automated Reminders',
                description: 'Reminders for attacks and events',
                value: 'reminder_notifications',
                emoji: '⏰'
              }
            ])
        );
      
      const cancelButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('cancel_setup')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );
      
      await interaction.update({
        embeds: [notificationEmbed],
        components: [notificationMenu, cancelButton],
        ephemeral: true
      });
    } catch (error) {
      log.error('Error handling notification setup:', { error: error.message });
      await interaction.update({
        content: 'An error occurred while setting up notifications. Please try again later.',
        components: [],
        ephemeral: true
      });
    }
  },
  
  /**
   * Create welcome message in a channel
   * @param {TextChannel} channel - Discord text channel
   * @param {String} clanName - Name of the clan
   * @param {String} clanTag - Tag of the clan
   */
  async createWelcomeMessage(channel, clanName = null, clanTag = null) {
    try {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('Welcome to Clash of Clans Bot!')
        .setDescription('This channel has been created by the setup wizard.')
        .setColor('#f1c40f')
        .addFields(
          { name: 'Getting Started', value: 'Use `/help` to see available commands' },
          { name: 'Server Configuration', value: 'This server has been configured with channels and roles for optimal Clash of Clans tracking.' }
        );
      
      if (clanName && clanTag) {
        welcomeEmbed.addFields({
          name: 'Linked Clan',
          value: `This server is linked to: ${clanName} (${clanTag})`
        });
      }
      
      await channel.send({ embeds: [welcomeEmbed] });
    } catch (error) {
      log.error('Error creating welcome message:', { error: error.message });
      // Don't throw, as this is a non-critical operation
    }
  }
};
