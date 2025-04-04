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
          !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
          !interaction.guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: 'I need the "Administrator" permission (which includes "Manage Channels" and "Manage Roles") to run the setup wizard.',
          ephemeral: true
        });
      }
      
      // Create the welcome embed with clear warning
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('⚠️ Clash of Clans Server Setup Wizard - DANGER ZONE ⚠️')
        .setDescription('**WARNING: This wizard will DELETE ALL EXISTING CHANNELS in your server!**')
        .setColor('#e74c3c')
        .addFields(
          { name: 'What will be PERMANENTLY DELETED:', value: '• All channels and categories\n• All message history\n• All pins and webhooks' },
          { name: 'What will be created instead:', value: '• Organized channels for clan management\n• Roles based on clan ranks (Leader, Co-Leader, etc.)\n• Category structure for war tracking, CWL, and clan capital' },
          { name: '⚠️ THIS CANNOT BE UNDONE!', value: 'Are you 100% sure you want to reset the entire server?' }
        );
        
      // Create the buttons for options
      const setupButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_reset')
            .setLabel('YES, RESET EVERYTHING')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId('cancel_setup')
            .setLabel('NO, CANCEL')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
        );
        
      await interaction.reply({
        embeds: [welcomeEmbed],
        components: [setupButtons],
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
      
      // First create roles to use for permissions
      await interaction.editReply({
        content: 'Creating roles with proper hierarchy...',
      });
      
      // Create roles with proper permissions hierarchy
      const roles = {
        'Bot Admin': { color: '#ff5555', position: 5, permissions: [
          PermissionFlagsBits.Administrator
        ]},
        'Leader': { color: '#e74c3c', position: 4, permissions: [
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.ManageMessages
        ]},
        'Co-Leader': { color: '#e67e22', position: 3, permissions: [
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.MentionEveryone
        ]},
        'Elder': { color: '#f1c40f', position: 2, permissions: [
          PermissionFlagsBits.ManageMessages
        ]},
        'Member': { color: '#2ecc71', position: 1, permissions: []},
        'Visitor': { color: '#3498db', position: 0, permissions: []}
      };
      
      const createdRoles = {};
      const everyoneRole = guild.roles.everyone;
      
      for (const [roleName, roleData] of Object.entries(roles)) {
        const role = await guild.roles.create({
          name: roleName,
          color: roleData.color,
          position: roleData.position,
          permissions: roleData.permissions,
          reason: 'Server setup for Clash of Clans bot'
        });
        createdRoles[roleName] = role;
        
        // Small delay between role creations
        await new Promise(r => setTimeout(r, 300));
      }
      
      // Create categories and channels with appropriate permissions
      const categories = [
        { 
          name: 'INFORMATION', 
          permissions: [
            // Public read-only channels for most users
            { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
            { id: createdRoles['Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
            { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'welcome', 
              type: 0, // TEXT
              topic: 'Welcome to our Clash of Clans server! Read this channel for important information.'
            },
            { 
              name: 'rules', 
              type: 0,
              topic: 'Server rules and code of conduct. All members must follow these rules.'
            },
            { 
              name: 'announcements', 
              type: 0,
              topic: 'Important clan announcements and news. Only leaders can post here.'
            },
            { 
              name: 'bot-info', 
              type: 0,
              topic: 'Information about bot commands and features. Type /help for command list.'
            }
          ]
        },
        { 
          name: 'WAR CENTER', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] },
            { id: createdRoles['Visitor'].id, deny: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'war-status', 
              type: 0,
              topic: 'Current war status and progress. Use /war status command to check war details.'
            },
            { 
              name: 'war-planning', 
              type: 0,
              topic: 'Plan war attacks and strategies here. Leaders and Co-Leaders can coordinate the clan.'
            },
            { 
              name: 'base-calling', 
              type: 0,
              topic: 'Call bases for attack. Use /war call [position] to reserve a base.'
            },
            { 
              name: 'attack-tracker', 
              type: 0,
              topic: 'Track attacks during war. Bot will post updates automatically.'
            },
            { 
              name: 'war-history', 
              type: 0,
              topic: 'Record of past wars. Use /war stats to see performance.'
            }
          ]
        },
        { 
          name: 'CWL CENTER', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] },
            { id: createdRoles['Visitor'].id, deny: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'cwl-announcements', 
              type: 0,
              topic: 'CWL schedule and important updates. Leaders will post here.'
            },
            { 
              name: 'cwl-roster', 
              type: 0,
              topic: 'CWL roster management. Check who is in the current rotation.'
            },
            { 
              name: 'daily-matchups', 
              type: 0,
              topic: 'Daily CWL war matchups and assignments.'
            },
            { 
              name: 'medal-tracking', 
              type: 0,
              topic: 'Track CWL medals earned. Use /cwl medals to check potential rewards.'
            }
          ]
        },
        { 
          name: 'CLAN CAPITAL', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'capital-status', 
              type: 0,
              topic: 'Current Clan Capital status and progress. Use /capital status for details.'
            },
            { 
              name: 'raid-weekends', 
              type: 0,
              topic: 'Raid Weekend planning and coordination. Discuss attack strategy here.'
            },
            { 
              name: 'contribution-tracker', 
              type: 0,
              topic: 'Track Capital Gold contributions. Use /capital contribute to log donations.'
            },
            { 
              name: 'upgrade-planning', 
              type: 0,
              topic: 'Plan and vote on next Capital upgrades. Leaders will make final decisions.'
            }
          ]
        },
        { 
          name: 'CLAN MANAGEMENT', 
          permissions: [
            // Only leaders and co-leaders can access
            { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.ViewChannel] }
          ],
          channels: [
            { 
              name: 'member-stats', 
              type: 0,
              topic: 'Member statistics and performance tracking. Leaders only.'
            },
            { 
              name: 'clan-games', 
              type: 0,
              topic: 'Clan Games coordination and planning. Track points here.'
            },
            { 
              name: 'activity-tracking', 
              type: 0,
              topic: 'Track member activity and participation. Identify inactive members.'
            },
            { 
              name: 'leadership-chat', 
              type: 0,
              topic: 'Private leadership discussion channel. Strategy and planning.'
            }
          ]
        },
        { 
          name: 'COMMUNITY', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'general-chat', 
              type: 0,
              topic: 'General clan discussion. Keep it friendly and follow the rules!'
            },
            { 
              name: 'clash-discussion', 
              type: 0,
              topic: 'Discuss Clash of Clans strategy, updates, and meta.'
            },
            { 
              name: 'off-topic', 
              type: 0,
              topic: 'Chat about topics outside of Clash of Clans. Keep it appropriate!'
            },
            { 
              name: 'bot-commands', 
              type: 0,
              topic: 'Use bot commands here to avoid cluttering other channels.'
            }
          ]
        },
        { 
          name: 'VOICE CHANNELS', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'War Planning', 
              type: 2, // VOICE
              userLimit: 10
            },
            { 
              name: 'Clan Hangout', 
              type: 2, // VOICE
              userLimit: 20
            },
            { 
              name: 'Leadership Chat', 
              type: 2, // VOICE
              userLimit: 5,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel] }
              ]
            },
            { 
              name: 'AFK', 
              type: 2, // VOICE
              userLimit: 0
            }
          ]
        },
        { 
          name: 'BOT NOTIFICATIONS', 
          permissions: [
            // Everyone can read, only the bot can write
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'war-alerts', 
              type: 0,
              topic: 'Automated war alerts from the bot. War start, end, and attack notifications.'
            },
            { 
              name: 'member-updates', 
              type: 0,
              topic: 'Member join/leave notifications and role changes.'
            },
            { 
              name: 'donation-tracking', 
              type: 0,
              topic: 'Automated tracking of troop donations and requests.'
            },
            { 
              name: 'event-reminders', 
              type: 0,
              topic: 'Reminders about upcoming events, wars, and deadlines.'
            }
          ]
        },
        { 
          name: 'PRIVATE TESTING', 
          permissions: [
            // Private category - hide from everyone by default
            { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] }
          ],
          channels: [
            { 
              name: 'bot-testing', 
              type: 0,
              topic: 'Test bot commands here without cluttering other channels. Messages are private between you and the bot.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.ViewChannel] }
              ]
            },
            { 
              name: 'dev-logs', 
              type: 0,
              topic: 'Bot development logs and error tracking. Admin use only.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.ViewChannel] }
              ]
            }
          ]
        }
      ];
      
      // Create categories and channels
      const createdCategories = [];
      const createdChannels = {};
      
      // Count how many we'll create
      const categoryTotal = categories.length;
      const channelTotal = categories.reduce((count, cat) => count + cat.channels.length, 0);
      
      // Send progress update
      await interaction.editReply({
        content: `Setting up sophisticated server structure...\nCreating ${categoryTotal} categories and ${channelTotal} channels with proper permissions.\n(This may take a minute)`
      });
      
      // Track progress
      let categoryCount = 0;
      let channelCount = 0;
      
      // Update the interaction with progress
      await interaction.editReply({
        content: `Setting up sophisticated server structure...\nCreating category 1/${categoryTotal}`
      });
      
      // Process each category one by one
      for (const category of categories) {
        try {
          categoryCount++;
          
          // Create permission overwrites for the category
          const permissionOverwrites = [];
          
          // Add category-wide permission overwrites if defined
          if (category.permissions) {
            for (const permission of category.permissions) {
              permissionOverwrites.push({
                id: permission.id,
                allow: permission.allow || [],
                deny: permission.deny || []
              });
            }
          }
          
          // Create new category with permissions
          const createdCategory = await guild.channels.create({
            name: category.name,
            type: 4, // GUILD_CATEGORY
            reason: 'Server setup for Clash of Clans bot',
            permissionOverwrites: permissionOverwrites
          });
          
          log.info(`Created category: ${category.name} with custom permissions`);
          createdCategories.push(createdCategory);
          
          // Update progress
          await interaction.editReply({
            content: `Setting up sophisticated server structure...\n` + 
                    `Created category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                    `Creating channels for this category...`
          }).catch(() => {}); // Ignore errors if we can't update
          
          // Create channels in category with custom permissions
          for (const channel of category.channels) {
            try {
              // Create channel-specific permission overwrites
              let channelPermissions = [...permissionOverwrites]; // Inherit from category
              
              // Add channel-specific permissions if defined
              if (channel.permissionOverwrites) {
                for (const permission of channel.permissionOverwrites) {
                  channelPermissions.push({
                    id: permission.id,
                    allow: permission.allow || [],
                    deny: permission.deny || []
                  });
                }
              }
              
              // Create channel
              const channelOptions = {
                name: channel.name,
                type: channel.type, // Use specified type (0 for text, 2 for voice)
                parent: createdCategory.id,
                topic: channel.topic || '', // Set channel topic/description
                reason: 'Server setup for Clash of Clans bot',
                permissionOverwrites: channelPermissions
              };
              
              // Add voice-specific options if applicable
              if (channel.type === 2 && channel.userLimit !== undefined) {
                channelOptions.userLimit = channel.userLimit;
              }
              
              const createdChannel = await guild.channels.create(channelOptions);
              
              // Store created channels by name for later use
              createdChannels[channel.name] = createdChannel;
              channelCount++;
              
              log.info(`Created ${channel.type === 0 ? 'text' : 'voice'} channel: ${channel.name} with custom permissions`);
              
              // Update progress every few channels or on the last channel
              if (channelCount % 5 === 0 || channelCount === channelTotal) {
                await interaction.editReply({
                  content: `Setting up sophisticated server structure...\n` + 
                          `Created category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                          `Created channels: ${channelCount}/${channelTotal}`
                }).catch(() => {}); // Ignore errors if we can't update
              }
              
              // Small delay to avoid rate limits
              await new Promise(r => setTimeout(r, 500));
            } catch (channelError) {
              log.error(`Failed to create channel ${channel.name}:`, { 
                error: channelError.message,
                stack: channelError.stack
              });
              // Continue with next channel rather than aborting completely
            }
          }
          
          // Small delay between categories to avoid rate limits
          await new Promise(r => setTimeout(r, 750));
          
          // Update progress before moving to next category
          if (categoryCount < categoryTotal) {
            await interaction.editReply({
              content: `Setting up sophisticated server structure...\n` + 
                      `Completed category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                      `Moving to next category...`
            }).catch(() => {}); // Ignore errors if we can't update
          }
        } catch (categoryError) {
          log.error(`Failed to create category ${category.name}:`, { 
            error: categoryError.message,
            stack: categoryError.stack
          });
          // Continue with next category rather than aborting completely
          
          // Still increment category count for progress tracking
          categoryCount++;
          
          // Update progress after error
          await interaction.editReply({
            content: `Setting up sophisticated server structure...\n` + 
                    `⚠️ Failed to create category ${category.name} (${categoryCount}/${categoryTotal})\n` +
                    `Continuing with next category...`
          }).catch(() => {}); // Ignore errors if we can't update
        }
      }
      
      // Send progress update
      await interaction.editReply({
        content: `Created sophisticated server structure with appropriate permissions. Setting up welcome messages...`
      });
      
      // Note: Roles have already been created earlier in this function, no need to recreate them
      
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
        
        // Add welcome message to the welcome channel
        if (createdChannels['welcome']) {
          await this.createWelcomeMessage(createdChannels['welcome'], clanName, clanTag);
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
              { name: '3. Stay Organized', value: 'Use channels for their intended purposes. Keep war planning in war channels.' },
              { name: '4. Follow CoC Terms', value: 'Do not discuss account sharing, buying/selling, or other ToS violations.' },
              { name: '5. Use Bot Commands Properly', value: 'Learn and use bot commands correctly. Ask for help if needed.' },
              { name: '6. Respect Leadership', value: 'Follow directions from clan leadership and server admins.' },
              { name: '7. No Advertising', value: 'No advertising other clans, servers, or services without permission.' },
              { name: '8. Have Fun!', value: 'This server exists to enhance our Clash of Clans experience - enjoy it!' }
            );
          
          await createdChannels['rules'].send({ embeds: [rulesEmbed] });
        }
        
        // Add announcements template
        if (createdChannels['announcements']) {
          const announcementEmbed = new EmbedBuilder()
            .setTitle('Clan Announcements')
            .setDescription('Important updates and announcements will be posted here.')
            .setColor('#f39c12')
            .addFields(
              { name: 'Announcement Channel', value: 'This channel is for important clan announcements only. Regular chat should be in the community channels.' },
              { name: 'Who Can Post', value: 'Only Leaders, Co-Leaders, and Bot Admins can post in this channel.' },
              { name: 'Notifications', value: 'Important announcements may include @mentions for visibility. Configure your notification settings accordingly.' }
            );
          
          await createdChannels['announcements'].send({ embeds: [announcementEmbed] });
        }
        
        // Add bot info to bot-info channel
        if (createdChannels['bot-info']) {
          const commandsEmbed = new EmbedBuilder()
            .setTitle('Bot Commands & Features')
            .setDescription('Here are some of the key features available with the Clash of Clans bot:')
            .setColor('#3498db')
            .addFields(
              { name: '⚔️ War Management', value: '• `/war status` - View current war status\n• `/war call [position]` - Call a base to attack\n• `/war map` - View the current war map with calls\n• `/war stats` - View war performance statistics\n• `/war plan` - Coordinate attack planning' },
              { name: '🏆 CWL Tools', value: '• `/cwl status` - Check CWL status\n• `/cwl roster` - Manage your CWL roster\n• `/cwl medals` - Calculate expected medals\n• `/cwl stats` - View CWL performance metrics\n• `/cwl plan` - Plan CWL matchups' },
              { name: '🏰 Clan Capital', value: '• `/capital status` - View capital progress\n• `/capital contribute` - Track capital gold donations\n• `/capital raids` - Monitor raid weekend progress\n• `/capital planner` - Plan district upgrades' },
              { name: '👤 Player Commands', value: '• `/player info [tag]` - View detailed player stats\n• `/player link [tag]` - Link your CoC account\n• `/player trophies` - Track trophy progress' }
            );
          
          const permissionsEmbed = new EmbedBuilder()
            .setTitle('Command Permissions')
            .setDescription('Different commands require different permission levels:')
            .setColor('#f39c12')
            .addFields(
              { name: 'Everyone Can Use:', value: '• Player info commands\n• War status viewing\n• CWL status viewing\n• Capital status viewing' },
              { name: 'Members Can Use:', value: '• Linking accounts\n• Base calling\n• Contributing tracking' },
              { name: 'Elders Can Use:', value: '• War stats commands\n• CWL roster viewing\n• Attack tracking' },
              { name: 'Co-Leaders & Leaders Can Use:', value: '• CWL roster management\n• War planning\n• Capital upgrade planning' },
              { name: 'Bot Admin Only:', value: '• Server setup\n• Bot configuration\n• Link/unlink clan' }
            );
          
          await createdChannels['bot-info'].send({ embeds: [commandsEmbed] });
          await createdChannels['bot-info'].send({ embeds: [permissionsEmbed] });
        }
        
        // Add info to bot-commands channel
        if (createdChannels['bot-commands']) {
          const botCommandsEmbed = new EmbedBuilder()
            .setTitle('Bot Commands Channel')
            .setDescription('This channel is dedicated to using bot commands.')
            .setColor('#3498db')
            .addFields(
              { name: 'Purpose', value: 'Use this channel to interact with the bot without cluttering other channels.' },
              { name: 'Command Basics', value: 'Type `/` to see all available commands\nUse `/help` for command documentation' },
              { name: 'Getting Started', value: 'First steps:\n1. Link your account: `/player link [your-tag]`\n2. Check clan status: `/clan info`\n3. View current war: `/war status`' }
            );
          
          await createdChannels['bot-commands'].send({ embeds: [botCommandsEmbed] });
        }
        
        // Add info to bot-testing channel if it exists
        if (createdChannels['bot-testing']) {
          const testingEmbed = new EmbedBuilder()
            .setTitle('Private Bot Testing Channel')
            .setDescription('This channel is for testing bot commands without cluttering public channels.')
            .setColor('#34495e')
            .addFields(
              { name: 'Channel Purpose', value: 'Use this channel to experiment with bot commands and features without disrupting conversations in other channels.' },
              { name: 'Private Access', value: 'This channel is only visible to members with appropriate permissions, ensuring your tests remain private.' },
              { name: 'Test Freely', value: 'Feel free to try any commands here. Messages are only visible to you and other authorized members.' }
            );
          
          await createdChannels['bot-testing'].send({ embeds: [testingEmbed] });
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
      log.error('Error setting up single clan server:', { 
        error: error.message,
        stack: error.stack 
      });
      
      // Create more detailed error message
      let errorMessage = 'Error setting up server: ' + error.message;
      
      // Add more specific guidance based on error type
      if (error.code === 50013) {
        errorMessage = 'Missing permissions to create channels or roles. Please check my role permissions and ensure I have "Manage Channels" and "Manage Roles" permissions.';
      } else if (error.code === 10003) {
        errorMessage = 'Unable to create channels. Please try again later or create them manually.';
      } else if (error.message.includes('Missing Access')) {
        errorMessage = 'I don\'t have permission to view or modify some channels. Please check my permissions.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Discord rate limit reached. Please wait a few minutes and try again.';
      }
      
      // Send detailed message instead of throwing error
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: errorMessage + '\n\nTry creating channels and roles manually if this issue persists.'
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: errorMessage + '\n\nTry creating channels and roles manually if this issue persists.',
          ephemeral: true
        });
      }
      
      // Still throw the error to propagate it properly
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
      
      // First create roles to use for permissions
      await interaction.editReply({
        content: 'Creating roles with proper hierarchy for multi-clan setup...',
      });
      
      // Create roles with proper permissions hierarchy
      const roles = {
        'Bot Admin': { color: '#ff5555', position: 15, permissions: [
          PermissionFlagsBits.Administrator
        ]},
        'Family Leader': { color: '#e74c3c', position: 14, permissions: [
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.MentionEveryone
        ]},
        'Family Co-Leader': { color: '#e67e22', position: 13, permissions: [
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.MentionEveryone
        ]}
      };
      
      // Add clan-specific roles
      for (let i = 1; i <= clanCount; i++) {
        roles[`Clan ${i} Leader`] = { 
          color: '#d35400', 
          position: 12 - (i - 1) * 3, 
          permissions: [
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ManageMessages
          ]
        };
        
        roles[`Clan ${i} Co-Leader`] = { 
          color: '#e67e22', 
          position: 11 - (i - 1) * 3, 
          permissions: [
            PermissionFlagsBits.ManageMessages
          ]
        };
        
        roles[`Clan ${i} Member`] = { 
          color: '#f1c40f', 
          position: 10 - (i - 1) * 3, 
          permissions: []
        };
      }
      
      // Add general roles
      roles['Member'] = { color: '#2ecc71', position: 2, permissions: []};
      roles['Visitor'] = { color: '#3498db', position: 1, permissions: []};
      
      const createdRoles = {};
      const everyoneRole = guild.roles.everyone;
      
      for (const [roleName, roleData] of Object.entries(roles)) {
        let role = guild.roles.cache.find(r => r.name === roleName);
        
        if (!role) {
          role = await guild.roles.create({
            name: roleName,
            color: roleData.color,
            hoist: true,
            position: roleData.position,
            permissions: roleData.permissions,
            reason: 'Server setup for Clash of Clans bot (multi-clan)'
          });
        }
        
        createdRoles[roleName] = role;
        
        // Small delay between role creations
        await new Promise(r => setTimeout(r, 300));
      }
      
      // Create categories and channels with appropriate permissions
      const categories = [
        { 
          name: 'INFORMATION', 
          permissions: [
            // Public read-only channels for most users
            { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
            { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
            { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'welcome', 
              type: 0, // TEXT
              topic: 'Welcome to our Clash of Clans family server! Read this channel for important information.'
            },
            { 
              name: 'rules', 
              type: 0,
              topic: 'Server rules and code of conduct. All members must follow these rules.'
            },
            { 
              name: 'announcements', 
              type: 0,
              topic: 'Important clan family announcements and news. Only leaders can post here.'
            },
            { 
              name: 'bot-info', 
              type: 0,
              topic: 'Information about bot commands and features. Type /help for command list.'
            },
            {
              name: 'clan-directory',
              type: 0,
              topic: 'Directory of all clans in our family. Find which clan is right for you!'
            }
          ]
        },
        { 
          name: 'CLAN HUB', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'clan-requirements', 
              type: 0,
              topic: 'Requirements for joining each clan in our family.'
            },
            { 
              name: 'move-requests', 
              type: 0,
              topic: 'Request to move between clans in our family. Leadership will review your request.'
            },
            { 
              name: 'join-requests', 
              type: 0,
              topic: 'Request to join one of our clans. Please provide your player tag and preferred clan.'
            }
          ]
        },
        { 
          name: 'WAR CENTER', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] },
            { id: createdRoles['Visitor'].id, deny: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'war-announcements', 
              type: 0,
              topic: 'War schedules and results for all clans. Leadership posts only.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: 'war-stats', 
              type: 0,
              topic: 'War statistics across all clans. Bot will post updates automatically.'
            },
            ...Array.from({ length: clanCount }, (_, i) => ({ 
              name: `clan${i+1}-war`, 
              type: 0,
              topic: `War planning and coordination for Clan ${i+1}. Use /war commands here.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i+1} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Member`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            }))
          ]
        },
        { 
          name: 'CWL CENTER', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] },
            { id: createdRoles['Visitor'].id, deny: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'cwl-announcements', 
              type: 0,
              topic: 'CWL schedule and important updates. Leaders will post here.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: 'cwl-roster-planning', 
              type: 0,
              topic: 'Plan CWL rosters across all clans. Leaders only.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel] }
              ]
            },
            ...Array.from({ length: clanCount }, (_, i) => ({ 
              name: `clan${i+1}-cwl`, 
              type: 0,
              topic: `CWL planning and coordination for Clan ${i+1}. Use /cwl commands here.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i+1} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Member`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            })),
            { 
              name: 'medal-tracking', 
              type: 0,
              topic: 'Track CWL medals earned across all clans. Use /cwl medals to check potential rewards.'
            }
          ]
        },
        { 
          name: 'CLAN CAPITAL', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'capital-announcements', 
              type: 0,
              topic: 'Capital raid weekend schedules and updates for all clans.',
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: 'raid-weekend-hub', 
              type: 0,
              topic: 'Coordination for raid weekends across all clans. Share tips and strategies.'
            },
            ...Array.from({ length: clanCount }, (_, i) => ({ 
              name: `clan${i+1}-capital`, 
              type: 0,
              topic: `Capital planning and tracking for Clan ${i+1}. Use /capital commands here.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i+1} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i+1} Member`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            }))
          ]
        },
        { 
          name: 'FAMILY LEADERSHIP', 
          permissions: [
            // Only family leadership can access
            { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.ViewChannel] }
          ],
          channels: [
            { 
              name: 'leadership-chat', 
              type: 0,
              topic: 'Private discussion channel for family leadership. Strategy and planning.'
            },
            { 
              name: 'admin-commands', 
              type: 0,
              topic: 'Use administrative bot commands here without cluttering other channels.'
            },
            { 
              name: 'family-planning', 
              type: 0,
              topic: 'Plan expansion, promotions, and other strategic decisions for the clan family.'
            },
            { 
              name: 'member-management', 
              type: 0,
              topic: 'Discuss member issues, promotions, demotions, and kicks across the clan family.'
            }
          ]
        },
        { 
          name: 'COMMUNITY', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'general-chat', 
              type: 0,
              topic: 'General chat for all members of the clan family. Keep it friendly!'
            },
            { 
              name: 'clash-discussion', 
              type: 0,
              topic: 'Discuss Clash of Clans strategy, updates, and meta changes.'
            },
            { 
              name: 'bot-commands', 
              type: 0,
              topic: 'Use general bot commands here to avoid cluttering other channels.'
            },
            { 
              name: 'off-topic', 
              type: 0,
              topic: 'Chat about topics outside of Clash of Clans. Keep it appropriate!'
            }
          ]
        },
        { 
          name: 'VOICE CHANNELS', 
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: 'Family Leadership', 
              type: 2, // VOICE
              userLimit: 10,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }
              ]
            },
            { 
              name: 'Family Lounge', 
              type: 2, // VOICE
              userLimit: 30
            },
            ...Array.from({ length: clanCount }, (_, i) => ({ 
              name: `Clan ${i+1} Planning`, 
              type: 2, // VOICE
              userLimit: 10,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i+1} Leader`].id, allow: [PermissionFlagsBits.Connect] },
                { id: createdRoles[`Clan ${i+1} Co-Leader`].id, allow: [PermissionFlagsBits.Connect] },
                { id: createdRoles[`Clan ${i+1} Member`].id, allow: [PermissionFlagsBits.Connect] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.Connect] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.Connect] }
              ]
            })),
            { 
              name: 'AFK', 
              type: 2, // VOICE
              userLimit: 0
            }
          ]
        },
        { 
          name: 'BOT NOTIFICATIONS', 
          permissions: [
            // Everyone can read, only the bot can write
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.SendMessages] }
          ],
          channels: [
            { 
              name: 'family-alerts', 
              type: 0,
              topic: 'Important automated alerts for the entire clan family.'
            },
            ...Array.from({ length: clanCount }, (_, i) => ({ 
              name: `clan${i+1}-alerts`, 
              type: 0,
              topic: `Automated alerts for Clan ${i+1} including war start/end and member updates.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: guild.members.me.id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            })),
            { 
              name: 'event-reminders', 
              type: 0,
              topic: 'Reminders about upcoming events, wars, and deadlines.'
            }
          ]
        },
        { 
          name: 'PRIVATE TESTING', 
          permissions: [
            // Private category - hide from everyone by default
            { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: createdRoles['Bot Admin'].id, allow: [PermissionFlagsBits.ViewChannel] }
          ],
          channels: [
            { 
              name: 'bot-testing', 
              type: 0,
              topic: 'Test bot commands here without cluttering other channels. Messages are private.'
            },
            { 
              name: 'dev-logs', 
              type: 0,
              topic: 'Bot development logs and error tracking. Admin use only.'
            }
          ]
        }
      ];
      
      // Create clan-specific categories
      for (let i = 1; i <= clanCount; i++) {
        categories.push({
          name: `CLAN ${i}`,
          permissions: [
            { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [] }
          ],
          channels: [
            { 
              name: `clan${i}-announcements`, 
              type: 0,
              topic: `Important announcements for Clan ${i} members.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: `clan${i}-chat`, 
              type: 0,
              topic: `General chat for members of Clan ${i}.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i} Member`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: `clan${i}-planning`, 
              type: 0,
              topic: `Strategic planning and coordination for Clan ${i}.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i} Leader`].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i} Co-Leader`].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Leader'].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: createdRoles['Family Co-Leader'].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
              ]
            },
            { 
              name: `clan${i}-member-log`, 
              type: 0,
              topic: `Track member activity in Clan ${i}.`,
              permissionOverwrites: [
                { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
                { id: createdRoles[`Clan ${i} Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: createdRoles[`Clan ${i} Co-Leader`].id, allow: [PermissionFlagsBits.SendMessages] },
                { id: guild.members.me.id, allow: [PermissionFlagsBits.SendMessages] }
              ]
            }
          ]
        });
      }
      
      // Create categories and channels
      const createdCategories = [];
      const createdChannels = {};
      
      // Count how many we'll create for progress reporting
      const categoryTotal = categories.length;
      const channelTotal = categories.reduce((count, cat) => count + cat.channels.length, 0);
      
      // Track progress
      let categoryCount = 0;
      let channelCount = 0;
      
      // Send progress update
      await interaction.editReply({
        content: `Setting up sophisticated multi-clan server structure...\nCreating ${categoryTotal} categories and ${channelTotal} channels with proper permissions.\nStarting with category 1/${categoryTotal}`
      });
      
      // Process each category one by one
      for (const category of categories) {
        try {
          categoryCount++;
          
          // Create permission overwrites for the category
          const permissionOverwrites = [];
          
          // Add category-wide permission overwrites if defined
          if (category.permissions) {
            for (const permission of category.permissions) {
              permissionOverwrites.push({
                id: permission.id,
                allow: permission.allow || [],
                deny: permission.deny || []
              });
            }
          }
          
          // Update progress
          await interaction.editReply({
            content: `Setting up sophisticated multi-clan server structure...\n` + 
                    `Creating category ${categoryCount}/${categoryTotal}: ${category.name}`
          }).catch(() => {}); // Ignore errors if we can't update
          
          // Create new category with permissions
          const createdCategory = await guild.channels.create({
            name: category.name,
            type: 4, // GUILD_CATEGORY
            reason: 'Server setup for Clash of Clans bot (multi-clan)',
            permissionOverwrites: permissionOverwrites
          });
          
          log.info(`Created category: ${category.name} with custom permissions`);
          createdCategories.push(createdCategory);
          
          // Update progress again to show we're creating channels
          await interaction.editReply({
            content: `Setting up sophisticated multi-clan server structure...\n` + 
                    `Created category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                    `Creating channels for this category...`
          }).catch(() => {}); // Ignore errors if we can't update
          
          // Create channels in category with custom permissions
          for (const channel of category.channels) {
            try {
              // Create channel-specific permission overwrites
              let channelPermissions = [...permissionOverwrites]; // Inherit from category
              
              // Add channel-specific permissions if defined
              if (channel.permissionOverwrites) {
                for (const permission of channel.permissionOverwrites) {
                  channelPermissions.push({
                    id: permission.id,
                    allow: permission.allow || [],
                    deny: permission.deny || []
                  });
                }
              }
              
              // Create channel
              const channelOptions = {
                name: channel.name,
                type: channel.type, // Use specified type (0 for text, 2 for voice)
                parent: createdCategory.id,
                topic: channel.topic || '', // Set channel topic/description
                reason: 'Server setup for Clash of Clans bot (multi-clan)',
                permissionOverwrites: channelPermissions
              };
              
              // Add voice-specific options if applicable
              if (channel.type === 2 && channel.userLimit !== undefined) {
                channelOptions.userLimit = channel.userLimit;
              }
              
              const createdChannel = await guild.channels.create(channelOptions);
              
              // Store created channels by name for later use
              createdChannels[channel.name] = createdChannel;
              channelCount++;
              
              log.info(`Created ${channel.type === 0 ? 'text' : 'voice'} channel: ${channel.name} with custom permissions`);
              
              // Update progress periodically
              if (channelCount % 5 === 0 || channelCount === channelTotal) {
                await interaction.editReply({
                  content: `Setting up sophisticated multi-clan server structure...\n` + 
                          `Created category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                          `Created channels: ${channelCount}/${channelTotal}`
                }).catch(() => {}); // Ignore errors if we can't update
              }
              
              // Small delay to avoid rate limits - increased to be safer
              await new Promise(r => setTimeout(r, 500));
            } catch (channelError) {
              log.error(`Failed to create channel ${channel.name}:`, { 
                error: channelError.message,
                stack: channelError.stack
              });
              // Continue with next channel rather than aborting completely
            }
          }
          
          // Small delay between categories to avoid rate limits - increased to be safer
          await new Promise(r => setTimeout(r, 750));
          
          // Update progress between categories
          if (categoryCount < categoryTotal) {
            await interaction.editReply({
              content: `Setting up sophisticated multi-clan server structure...\n` + 
                      `Completed category ${categoryCount}/${categoryTotal}: ${category.name}\n` +
                      `Moving to next category...`
            }).catch(() => {}); // Ignore errors if we can't update
          }
        } catch (categoryError) {
          log.error(`Failed to create category ${category.name}:`, { 
            error: categoryError.message,
            stack: categoryError.stack
          });
          
          // Update progress after error
          await interaction.editReply({
            content: `Setting up sophisticated multi-clan server structure...\n` + 
                    `⚠️ Failed to create category ${category.name} (${categoryCount}/${categoryTotal})\n` +
                    `Continuing with next category...`
          }).catch(() => {}); // Ignore errors if we can't update
          
          // Continue with next category rather than aborting completely
        }
      }
      
      // Send progress update
      await interaction.editReply({
        content: `Created sophisticated server structure with appropriate permissions. Setting up welcome messages...`
      });
      
      // Add welcome messages to appropriate channels
      try {
        // Add welcome message to the welcome channel
        if (createdChannels['welcome']) {
          const welcomeEmbed = new EmbedBuilder()
            .setTitle('Welcome to Your Clash of Clans Family Server!')
            .setDescription(`This server has been optimized to manage ${clanCount} clans with integrated bot features.`)
            .setColor('#f1c40f')
            .addFields(
              { name: '🛠️ Getting Started', value: 'Use `/help` to see available commands\nUse `/clan link [tag]` to link each clan to this server' },
              { name: '📋 Server Structure', value: '• **INFORMATION** - Server rules and announcements\n• **CLAN HUB** - Information about all clans\n• **WAR CENTER** - War planning for each clan\n• **CWL CENTER** - Clan War League management\n• **CLAN CAPITAL** - Raid weekend coordination\n• **FAMILY LEADERSHIP** - Private leadership channels\n• **CLAN-SPECIFIC** - Individual channels for each clan\n• **COMMUNITY** - General chat channels\n• **VOICE CHANNELS** - Voice chat for planning\n• **BOT NOTIFICATIONS** - Automated alerts and updates' },
              { name: '👑 Role Hierarchy', value: 'The server includes roles for both family and clan leadership:\n• **Family Leader** - Overall family administration\n• **Family Co-Leader** - Family management assistance\n• **Clan X Leader** - Leadership for specific clans\n• **Clan X Co-Leader** - Co-leadership for specific clans\n• **Clan X Member** - Members of specific clans\n• **Member** - General membership\n• **Visitor** - Limited access role\n• **Bot Admin** - Technical bot management' }
            );
          
          await createdChannels['welcome'].send({ embeds: [welcomeEmbed] });
          
          // Add setup information
          const setupEmbed = new EmbedBuilder()
            .setTitle('Setup Instructions for Clan Family')
            .setDescription('To get the most out of this server, complete these steps:')
            .setColor('#e74c3c')
            .addFields(
              { name: '1️⃣ Link Your Clans', value: `Use \`/clan link [tag]\` to connect each of your ${clanCount} clans to the bot` },
              { name: '2️⃣ Assign Roles', value: 'Give members appropriate clan-specific roles' },
              { name: '3️⃣ Configure Notifications', value: 'Set up which notifications you want in each channel' },
              { name: '4️⃣ Update Clan Information', value: 'Fill in clan information in the clan-directory channel' },
              { name: '5️⃣ Test Bot Functions', value: 'Try essential commands in each clan channel' }
            );
          
          await createdChannels['welcome'].send({ embeds: [setupEmbed] });
        }
        
        // Add clan directory info
        if (createdChannels['clan-directory']) {
          const directoryEmbed = new EmbedBuilder()
            .setTitle('Clan Family Directory')
            .setDescription(`Information about all ${clanCount} clans in our family.`)
            .setColor('#2ecc71')
            .addFields(
              { name: 'Linking Clans', value: 'Admins: Use `/clan link [tag]` to link each clan' },
              { name: 'Viewing Clan Info', value: 'Members: Use `/clan info [tag]` to see details about any linked clan' }
            );
          
          for (let i = 1; i <= clanCount; i++) {
            directoryEmbed.addFields({
              name: `Clan ${i}`,
              value: 'Use `/clan link [tag]` to set clan information'
            });
          }
          
          await createdChannels['clan-directory'].send({ embeds: [directoryEmbed] });
          
          // Add clan requirements embed
          const requirementsEmbed = new EmbedBuilder()
            .setTitle('Clan Requirements')
            .setDescription('Each clan has different requirements for joining.')
            .setColor('#3498db');
          
          for (let i = 1; i <= clanCount; i++) {
            requirementsEmbed.addFields({
              name: `Clan ${i} Requirements`,
              value: 'Edit this to add specific requirements for Clan ' + i
            });
          }
          
          if (createdChannels['clan-requirements']) {
            await createdChannels['clan-requirements'].send({ embeds: [requirementsEmbed] });
          }
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
              { name: '3. Stay Organized', value: 'Use channels for their intended purposes. Use clan-specific channels for clan matters.' },
              { name: '4. Follow CoC Terms', value: 'Do not discuss account sharing, buying/selling, or other ToS violations.' },
              { name: '5. Use Bot Commands Properly', value: 'Learn and use bot commands correctly. Ask for help if needed.' },
              { name: '6. Respect Leadership', value: 'Follow directions from family and clan leadership.' },
              { name: '7. No Advertising', value: 'No advertising other clans, servers, or services without permission.' },
              { name: '8. Use Appropriate Channels', value: 'Use the correct clan channels for your clan. Do not post in channels for clans you are not in.' }
            );
          
          await createdChannels['rules'].send({ embeds: [rulesEmbed] });
        }
        
        // Add bot info to bot-info channel
        if (createdChannels['bot-info']) {
          const commandsEmbed = new EmbedBuilder()
            .setTitle('Bot Commands & Features')
            .setDescription('Here are some of the key features available with the Clash of Clans bot:')
            .setColor('#3498db')
            .addFields(
              { name: '⚔️ War Management', value: '• `/war status [tag]` - View current war status\n• `/war call [tag] [position]` - Call a base to attack\n• `/war map [tag]` - View the current war map with calls\n• `/war stats [tag]` - View war performance statistics' },
              { name: '🏆 CWL Tools', value: '• `/cwl status [tag]` - Check CWL status\n• `/cwl roster [tag]` - Manage your CWL roster\n• `/cwl medals [tag]` - Calculate expected medals' },
              { name: '🏰 Clan Capital', value: '• `/capital status [tag]` - View capital progress\n• `/capital contribute [tag]` - Track capital gold donations\n• `/capital raids [tag]` - Monitor raid weekend progress' },
              { name: '👤 Player Commands', value: '• `/player info [tag]` - View detailed player stats\n• `/player link [tag]` - Link your CoC account' }
            );
          
          await createdChannels['bot-info'].send({ embeds: [commandsEmbed] });
          
          const multiFamilyEmbed = new EmbedBuilder()
            .setTitle('Multi-Clan Commands')
            .setDescription('Special commands for managing multiple clans:')
            .setColor('#9b59b6')
            .addFields(
              { name: 'Clan Tagging', value: 'When using commands, always specify which clan with [tag]' },
              { name: 'Family Overview', value: '• `/family overview` - See stats for all linked clans\n• `/family wars` - Check war status across all clans\n• `/family cwl` - Get CWL status for all clans' },
              { name: 'Member Management', value: '• `/member find [name/tag]` - Find a member across all clans\n• `/member history [tag]` - View member history across the family' }
            );
          
          await createdChannels['bot-info'].send({ embeds: [multiFamilyEmbed] });
        }
        
        // Add info to each clan's announcement channel
        for (let i = 1; i <= clanCount; i++) {
          const clanAnnouncementChannel = createdChannels[`clan${i}-announcements`];
          if (clanAnnouncementChannel) {
            const clanWelcomeEmbed = new EmbedBuilder()
              .setTitle(`Welcome to Clan ${i} Channel`)
              .setDescription(`This channel is dedicated to announcements for Clan ${i} members.`)
              .setColor('#f39c12')
              .addFields(
                { name: 'Clan Specific Commands', value: `When using commands for this clan, specify \`[tag]\` or use these channels for automatic targeting` },
                { name: 'Available Channels', value: `• **clan${i}-announcements**: Important information\n• **clan${i}-chat**: General discussion\n• **clan${i}-planning**: Leadership planning\n• **clan${i}-member-log**: Automated tracking\n• **clan${i}-war**: War coordination\n• **clan${i}-cwl**: CWL planning\n• **clan${i}-capital**: Capital management` },
                { name: 'Leadership', value: `This clan's channels are managed by members with the **Clan ${i} Leader** and **Clan ${i} Co-Leader** roles.` }
              );
            
            await clanAnnouncementChannel.send({ embeds: [clanWelcomeEmbed] });
          }
        }
        
        // Add war-announcements info
        if (createdChannels['war-announcements']) {
          const warAnnouncementEmbed = new EmbedBuilder()
            .setTitle('War Announcements Channel')
            .setDescription('This channel is for war schedules and results across all clans.')
            .setColor('#e74c3c')
            .addFields(
              { name: 'Purpose', value: 'Family leadership will post war schedules, matchups, and results here.' },
              { name: 'Read-Only', value: 'This is a read-only channel. Discuss wars in your clan-specific war channels.' },
              { name: 'War Commands', value: 'Use `/war status [tag]` in your clan channels to get detailed war information.' }
            );
          
          await createdChannels['war-announcements'].send({ embeds: [warAnnouncementEmbed] });
        }
        
        // Add cwl-announcements info
        if (createdChannels['cwl-announcements']) {
          const cwlAnnouncementEmbed = new EmbedBuilder()
            .setTitle('CWL Announcements Channel')
            .setDescription('This channel is for CWL schedules and updates across all clans.')
            .setColor('#f1c40f')
            .addFields(
              { name: 'Purpose', value: 'Family leadership will post CWL schedules, matchups, and results here.' },
              { name: 'Read-Only', value: 'This is a read-only channel. Discuss CWL in your clan-specific CWL channels.' },
              { name: 'CWL Commands', value: 'Use `/cwl status [tag]` in your clan channels to get detailed CWL information.' }
            );
          
          await createdChannels['cwl-announcements'].send({ embeds: [cwlAnnouncementEmbed] });
        }
        
        // Add bot-testing channel info if it exists
        if (createdChannels['bot-testing']) {
          const testingEmbed = new EmbedBuilder()
            .setTitle('Private Bot Testing Channel')
            .setDescription('This channel is for testing bot commands without cluttering public channels.')
            .setColor('#34495e')
            .addFields(
              { name: 'Channel Purpose', value: 'Use this channel to experiment with bot commands and features without disrupting conversations in other channels.' },
              { name: 'Private Access', value: 'This channel is only visible to members with appropriate permissions, ensuring your tests remain private.' },
              { name: 'Bot Admin Commands', value: 'Special administrative commands should be tested here before using in public channels.' }
            );
          
          await createdChannels['bot-testing'].send({ embeds: [testingEmbed] });
        }
        
      } catch (error) {
        log.error('Error creating multi-clan welcome messages:', { error: error.message });
        // Continue setup process even if welcome messages fail
      }
      
      // Update response with setup completion
      return interaction.editReply({
        content: `Server setup for ${clanCount} clans completed! Created:\n` +
                 `- ${categories.length} sophisticated categories\n` +
                 `- ${categories.reduce((count, cat) => count + cat.channels.length, 0)} channels with proper permissions\n` +
                 `- ${Object.keys(createdRoles).length} roles with hierarchical permissions\n\n` +
                 'Next steps: \n' +
                 '1. Link your clans using `/clan link [clan tag]`\n' +
                 '2. Assign appropriate clan roles to members\n' +
                 '3. Update clan information in the clan-directory channel\n' +
                 '4. Start using clan-specific commands in each clan\'s channels!'
      });
    } catch (error) {
      log.error('Error setting up multi-clan server:', { 
        error: error.message,
        stack: error.stack 
      });
      
      // Create more detailed error message
      let errorMessage = 'Error setting up server: ' + error.message;
      
      // Add more specific guidance based on error type
      if (error.code === 50013) {
        errorMessage = 'Missing permissions to create channels or roles. Please check my role permissions and ensure I have "Manage Channels" and "Manage Roles" permissions.';
      } else if (error.code === 10003) {
        errorMessage = 'Unable to create channels. Please try again later or create them manually.';
      } else if (error.message.includes('Missing Access')) {
        errorMessage = 'I don\'t have permission to view or modify some channels. Please check my permissions.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Discord rate limit reached. Please wait a few minutes and try again.';
      }
      
      // Send detailed message instead of throwing error
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: errorMessage + '\n\nTry creating channels and roles manually if this issue persists.'
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: errorMessage + '\n\nTry creating channels and roles manually if this issue persists.',
          ephemeral: true
        });
      }
      
      // Still throw the error to propagate it properly
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
        .setTitle('Welcome to Your Clash of Clans Server!')
        .setDescription('This server has been optimized for Clash of Clans clan management with integrated bot features.')
        .setColor('#f1c40f')
        .addFields(
          { name: '🛠️ Getting Started', value: 'Use `/help` to see available commands\nUse `/clan link [tag]` to link your clan to this server' },
          { name: '📋 Server Structure', value: '• **INFORMATION** - Server rules and announcements\n• **WAR CENTER** - War planning and base calling\n• **CWL CENTER** - Clan War League management\n• **CLAN CAPITAL** - Raid weekend coordination\n• **CLAN MANAGEMENT** - Leadership tools (private)\n• **COMMUNITY** - General chat channels\n• **VOICE CHANNELS** - Voice chat for planning\n• **BOT NOTIFICATIONS** - Automated alerts and updates\n• **PRIVATE TESTING** - Private channels for testing bot commands' },
          { name: '👑 Roles & Permissions', value: 'The server includes roles that match your in-game hierarchy:\n• **Leader** - Full server control\n• **Co-Leader** - Manage members and messages\n• **Elder** - Basic moderation permissions\n• **Member** - Standard access\n• **Visitor** - Limited viewing access\n• **Bot Admin** - Technical bot management' }
        );
      
      if (clanName && clanTag) {
        welcomeEmbed.addFields({
          name: '🏆 Linked Clan',
          value: `This server is linked to: **${clanName}** (${clanTag})`
        });
      } else {
        welcomeEmbed.addFields({
          name: '🔗 Link Your Clan',
          value: 'To link your clan to this server, use the command:\n`/clan link [your-clan-tag]`\n\nThis enables war tracking, CWL management, and other features.'
        });
      }
      
      await channel.send({ embeds: [welcomeEmbed] });
      
      // Send additional info messages
      const botInfoEmbed = new EmbedBuilder()
        .setTitle('Bot Commands & Features')
        .setDescription('Here are some of the key features available with the Clash of Clans bot:')
        .setColor('#3498db')
        .addFields(
          { name: '⚔️ War Management', value: '• `/war status` - View current war status\n• `/war call [position]` - Call a base to attack\n• `/war map` - View the current war map with calls\n• `/war stats` - View war performance statistics\n• `/war plan` - Coordinate attack planning' },
          { name: '🏆 CWL Tools', value: '• `/cwl status` - Check CWL status\n• `/cwl roster` - Manage your CWL roster\n• `/cwl medals` - Calculate expected medals\n• `/cwl stats` - View CWL performance metrics\n• `/cwl plan` - Plan CWL matchups' },
          { name: '🏰 Clan Capital', value: '• `/capital status` - View capital progress\n• `/capital contribute` - Track capital gold donations\n• `/capital raids` - Monitor raid weekend progress\n• `/capital planner` - Plan district upgrades' },
          { name: '👤 Player Commands', value: '• `/player info [tag]` - View detailed player stats\n• `/player link [tag]` - Link your CoC account\n• `/player trophies` - Track trophy progress' }
        );
      
      const setupNotesEmbed = new EmbedBuilder()
        .setTitle('Important Setup Notes')
        .setDescription('To get the most out of this server, please complete these steps:')
        .setColor('#e74c3c')
        .addFields(
          { name: '1️⃣ Link Your Clan', value: 'Use `/clan link [tag]` to connect your clan to the bot' },
          { name: '2️⃣ Assign Roles', value: 'Give members appropriate roles matching their in-game rank' },
          { name: '3️⃣ Customize Permissions', value: 'Fine-tune channel permissions if needed for your clan structure' },
          { name: '4️⃣ Test Bot Features', value: 'Try essential commands like `/war status` and `/cwl status`' },
          { name: '5️⃣ Invite Members', value: 'Share your Discord invite with clan members' },
          { name: '6️⃣ Set Up Notifications', value: 'Configure which notifications you want in the BOT NOTIFICATIONS channels' }
        );
      
      // Send additional info embeds
      await channel.send({ embeds: [botInfoEmbed] });
      await channel.send({ embeds: [setupNotesEmbed] });
      
      // If we have the rules channel, populate it
      const rulesChannel = channel.guild.channels.cache.find(c => c.name === 'rules');
      if (rulesChannel) {
        const rulesEmbed = new EmbedBuilder()
          .setTitle('Server Rules')
          .setDescription('To maintain a positive and productive environment, please follow these rules:')
          .setColor('#9b59b6')
          .addFields(
            { name: '1. Be Respectful', value: 'Treat all members with respect. No harassment, hate speech, or bullying.' },
            { name: '2. Keep it Clean', value: 'No NSFW content, excessive profanity, or inappropriate discussions.' },
            { name: '3. Stay Organized', value: 'Use channels for their intended purposes. Keep war planning in war channels.' },
            { name: '4. Follow CoC Terms', value: 'Do not discuss account sharing, buying/selling, or other ToS violations.' },
            { name: '5. Use Bot Commands Properly', value: 'Learn and use bot commands correctly. Ask for help if needed.' },
            { name: '6. Respect Leadership', value: 'Follow directions from clan leadership and server admins.' },
            { name: '7. No Advertising', value: 'No advertising other clans, servers, or services without permission.' },
            { name: '8. Have Fun!', value: 'This server exists to enhance our Clash of Clans experience - enjoy it!' }
          );
        
        await rulesChannel.send({ embeds: [rulesEmbed] });
      }
      
      // If we have bot-info channel, add command details
      const botInfoChannel = channel.guild.channels.cache.find(c => c.name === 'bot-info');
      if (botInfoChannel) {
        const commandsEmbed = new EmbedBuilder()
          .setTitle('Complete Bot Command Reference')
          .setDescription('Here is a comprehensive list of available bot commands:')
          .setColor('#2ecc71')
          .addFields(
            { name: '📋 General Commands', value: '`/help` - Show command list\n`/ping` - Check bot response time' },
            { name: '👤 Player Commands', value: '`/player info [tag]` - View player stats\n`/player link [tag]` - Link your account\n`/player heroes` - View hero levels\n`/player achievements` - View achievements' },
            { name: '🏰 Clan Commands', value: '`/clan info [tag]` - View clan details\n`/clan link [tag]` - Link clan to server\n`/clan members` - Show clan roster\n`/clan warlog` - View war history' },
            { name: '⚔️ War Commands', value: '`/war status` - Current war status\n`/war call [position]` - Call a base\n`/war map` - View war map\n`/war stats` - War statistics\n`/war plan` - View attack plan' },
            { name: '🏆 CWL Commands', value: '`/cwl status` - CWL status\n`/cwl roster` - Manage roster\n`/cwl medals` - Calculate medals\n`/cwl stats` - Performance stats\n`/cwl plan` - Attack planning' },
            { name: '🏙️ Capital Commands', value: '`/capital status` - Capital progress\n`/capital raids` - Raid weekend status\n`/capital contribute` - Track donations\n`/capital planner` - Upgrade planning' },
            { name: '⚙️ Admin Commands', value: '`/setup wizard` - Run setup wizard\n`/setup single` - Quick setup for one clan\n`/setup multi` - Quick setup for multiple clans' }
          );
        
        const permissionsEmbed = new EmbedBuilder()
          .setTitle('Command Permissions')
          .setDescription('Different commands require different permission levels:')
          .setColor('#f39c12')
          .addFields(
            { name: 'Everyone Can Use:', value: '• Player info commands\n• War status viewing\n• CWL status viewing\n• Capital status viewing' },
            { name: 'Members Can Use:', value: '• Linking accounts\n• Base calling\n• Contributing tracking' },
            { name: 'Elders Can Use:', value: '• War stats commands\n• CWL roster viewing\n• Attack tracking' },
            { name: 'Co-Leaders & Leaders Can Use:', value: '• CWL roster management\n• War planning\n• Capital upgrade planning' },
            { name: 'Bot Admin Only:', value: '• Server setup\n• Bot configuration\n• Link/unlink clan' }
          );
        
        await botInfoChannel.send({ embeds: [commandsEmbed] });
        await botInfoChannel.send({ embeds: [permissionsEmbed] });
      }
      
      // Add bot-testing channel info if it exists
      const botTestingChannel = channel.guild.channels.cache.find(c => c.name === 'bot-testing');
      if (botTestingChannel) {
        const testingEmbed = new EmbedBuilder()
          .setTitle('Private Bot Testing Channel')
          .setDescription('This channel is for testing bot commands without cluttering public channels.')
          .setColor('#34495e')
          .addFields(
            { name: 'Channel Purpose', value: 'Use this channel to experiment with bot commands and features without disrupting conversations in other channels.' },
            { name: 'Private Access', value: 'This channel is only visible to members with appropriate permissions, ensuring your tests remain private.' },
            { name: 'Test Freely', value: 'Feel free to try any commands here. Messages are only visible to you and other authorized members.' }
          );
        
        await botTestingChannel.send({ embeds: [testingEmbed] });
      }
      
    } catch (error) {
      log.error('Error creating welcome message:', { error: error.message });
      // Don't throw, as this is a non-critical operation
    }
  }
};
