// src/events/interactionCreate.js
const { Events, InteractionType, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { command: log } = require('../utils/logger');
const { Clan } = require('../models');
const clashApiService = require('../services/clashApiService');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // Handle different interaction types
      if (interaction.isChatInputCommand()) {
        await handleChatInputCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }
    } catch (error) {
      log.error('Error handling interaction:', { error: error.message });
      
      // Send error message if not already replied
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing this interaction.',
          ephemeral: true
        }).catch(e => {
          log.error('Failed to send error response:', { error: e.message });
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing this interaction.'
        }).catch(e => {
          log.error('Failed to edit deferred reply:', { error: e.message });
        });
      }
    }
  }
};

/**
 * Handle chat input commands
 * @param {Interaction} interaction - Discord interaction
 */
async function handleChatInputCommand(interaction) {
  // Get command name
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    log.warn(`Command ${interaction.commandName} not found`);
    return interaction.reply({
      content: 'This command is not available. Try using /help to see available commands.',
      ephemeral: true
    });
  }

  // Log the command execution attempt
  log.info(`Executing command ${interaction.commandName}`, {
    user: interaction.user.tag,
    guild: interaction.guild?.name || 'DM'
  });

  try {
    // Execute command
    await command.execute(interaction);
  } catch (error) {
    log.error(`Error executing command ${interaction.commandName}:`, {
      error: error.stack || error.message
    });

    // If we haven't replied yet, send an error message
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        ephemeral: true
      });
    } else if (interaction.deferred && !interaction.replied) {
      // If we've deferred but not replied, edit the deferred message
      await interaction.editReply({
        content: 'An error occurred while executing this command.'
      });
    }
  }
}

/**
 * Handle button interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  // Handle setup wizard buttons
  if (customId.startsWith('setup_')) {
    await handleSetupButtons(interaction, customId);
  } else if (customId.startsWith('create_')) {
    await handleCreationButtons(interaction, customId);
  } else if (customId.startsWith('cancel_')) {
    await interaction.update({
      content: 'Operation cancelled.',
      components: [],
      embeds: [],
      ephemeral: true
    });
  } else if (customId.startsWith('sync_')) {
    await handleSyncButtons(interaction, customId);
  }
}

/**
 * Handle select menu interactions
 * @param {Interaction} interaction - Discord interaction
 */
async function handleSelectMenuInteraction(interaction) {
  const { customId, values } = interaction;

  // Handle channel setup select menu
  if (customId === 'channel_setup') {
    await handleChannelSetupSelection(interaction, values[0]);
  } else if (customId === 'notification_setup') {
    await handleNotificationSetupSelection(interaction, values);
  }
}

/**
 * Handle setup wizard buttons
 * @param {Interaction} interaction - Discord interaction
 * @param {String} customId - Button custom ID
 */
async function handleSetupButtons(interaction, customId) {
  // Need administrator permissions for all setup operations
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'You need Administrator permissions to use the setup wizard.',
      ephemeral: true
    });
  }

  switch (customId) {
    case 'confirm_reset':
      // Show final confirmation with what will be lost
      await showResetConfirmation(interaction);
      break;
    case 'reset_confirmed':
      // Start the server reset process
      await resetAndSetupServer(interaction);
      break;
    case 'setup_options':
      // Show all setup options
      await showSetupOptions(interaction);
      break;
    case 'setup_channels':
      // Show channel setup options - this will redirect to the channel setup handler
      const channelCommand = interaction.client.commands.get('setup');
      if (channelCommand) {
        await channelCommand.handleChannels(interaction);
      }
      break;
    case 'setup_roles':
      // Show role setup options - this will redirect to the role setup handler
      const roleCommand = interaction.client.commands.get('setup');
      if (roleCommand) {
        await roleCommand.handleRoles(interaction);
      }
      break;
    case 'setup_notifications':
      // Show notification setup options - this will redirect to the notification setup handler
      const notificationCommand = interaction.client.commands.get('setup');
      if (notificationCommand) {
        await notificationCommand.handleNotifications(interaction);
      }
      break;
    case 'setup_all':
      // Start the comprehensive setup process
      await handleAllInOneSetup(interaction);
      break;
    default:
      await interaction.update({
        content: 'Unknown setup option selected.',
        components: [],
        ephemeral: true
      });
      break;
  }
}

/**
 * Show final confirmation before resetting server
 * @param {Interaction} interaction - Discord interaction
 */
async function showResetConfirmation(interaction) {
  const warningEmbed = new EmbedBuilder()
    .setTitle('⚠️ FINAL WARNING: Server Reset ⚠️')
    .setDescription('You are about to **PERMANENTLY DELETE** all channels and categories in this server.')
    .setColor('#e74c3c')
    .addFields(
      { name: 'What will be lost:', value: '• All message history\n• All channel permissions\n• All pins and attachments\n• All webhooks and integrations' },
      { name: 'What will be kept:', value: '• Server members and their roles\n• Server emojis and stickers\n• Server boosts and settings\n• Voice channel members will be disconnected but not removed from the server' },
      { name: '❗ THIS CANNOT BE UNDONE!', value: 'Are you absolutely sure you want to continue?' }
    );
    
  const confirmButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reset_confirmed')
        .setLabel('YES, RESET EVERYTHING')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId('cancel_setup')
        .setLabel('NO, CANCEL')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );
    
  await interaction.update({
    embeds: [warningEmbed],
    components: [confirmButtons],
    ephemeral: true
  });
}

/**
 * Show all setup options
 * @param {Interaction} interaction - Discord interaction
 */
async function showSetupOptions(interaction) {
  const optionsEmbed = new EmbedBuilder()
    .setTitle('Clash of Clans Setup Options')
    .setDescription('Choose what you want to set up:')
    .setColor('#3498db')
    .addFields(
      { name: 'Channels & Categories', value: 'Create organized channels for clan management' },
      { name: 'Roles & Permissions', value: 'Set up clan hierarchy roles with permissions' },
      { name: 'Notifications', value: 'Configure automated notifications' },
      { name: 'Complete Setup', value: 'Do everything at once (recommended)' }
    );
    
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
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_setup')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );
    
  await interaction.update({
    embeds: [optionsEmbed],
    components: [setupButtons, allInOneButton],
    ephemeral: true
  });
}

/**
 * Reset server and set up new structure
 * @param {Interaction} interaction - Discord interaction
 */
async function resetAndSetupServer(interaction) {
  await interaction.update({
    content: '🚀 Starting server reset and setup process...',
    embeds: [],
    components: [],
    ephemeral: true
  });
  
  const guild = interaction.guild;
  
  try {
    // Check if bot has Administrator permissions
    if (!guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({
        content: '❌ Error: I need Administrator permissions to reset the server.',
        ephemeral: true
      });
    }
    
    // Step 1: Create backup of channel structure
    await interaction.editReply({
      content: '📋 Creating backup of channel structure...',
      ephemeral: true
    });
    
    const backupData = {
      timestamp: new Date().toISOString(),
      serverName: guild.name,
      channels: [],
      categories: []
    };
    
    // Gather channel and category data
    guild.channels.cache.forEach(channel => {
      if (channel.type === 4) { // GUILD_CATEGORY
        backupData.categories.push({
          name: channel.name,
          position: channel.position,
          id: channel.id
        });
      } else if (channel.type === 0) { // GUILD_TEXT
        backupData.channels.push({
          name: channel.name,
          parentId: channel.parentId,
          position: channel.position,
          id: channel.id
        });
      }
    });
    
    // Step 2: Delete all channels
    await interaction.editReply({
      content: '🗑️ Deleting all channels and categories...',
      ephemeral: true
    });
    
    // Delete channels first, then categories to avoid errors
    const textChannels = guild.channels.cache.filter(c => c.type === 0);
    for (const [id, channel] of textChannels) {
      try {
        await channel.delete('Server reset by setup wizard');
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        log.error(`Failed to delete channel ${channel.name}:`, { error: error.message });
      }
    }
    
    // Delete categories
    const categories = guild.channels.cache.filter(c => c.type === 4);
    for (const [id, category] of categories) {
      try {
        await category.delete('Server reset by setup wizard');
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        log.error(`Failed to delete category ${category.name}:`, { error: error.message });
      }
    }
    
    // Step 3: Set up new structure
    await interaction.editReply({
      content: '🏗️ Setting up new server structure... (This may take a minute)',
      ephemeral: true
    });
    
    // Use the setupSingleClan method from the setup command
    const setupCommand = interaction.client.commands.get('setup');
    if (setupCommand) {
      await setupCommand.setupSingleClan(interaction);
      
      // Success message after completion
      await interaction.editReply({
        content: '✅ Server has been reset and set up successfully!\n\nNext steps:\n1. Link your clan with `/clan link [tag]`\n2. Set up channel permissions if needed\n3. Start using the bot commands',
        ephemeral: true
      });
    } else {
      // If setup command can't be found
      await interaction.editReply({
        content: '❌ Error: Could not find the setup command. Server channels have been deleted, but new structure could not be created.',
        ephemeral: true
      });
    }
  } catch (error) {
    log.error('Error in server reset and setup:', { error: error.message, stack: error.stack });
    await interaction.editReply({
      content: `❌ An error occurred during server reset: ${error.message}\n\nSome channels may have been deleted. Please try setting up the server manually.`,
      ephemeral: true
    });
  }
}

/**
 * Handle all-in-one server setup
 * @param {Interaction} interaction - Discord interaction
 */
async function handleAllInOneSetup(interaction) {
  // Check if we have the required permissions
  const requiredPermissions = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles
  ];

  for (const permission of requiredPermissions) {
    if (!interaction.guild.members.me.permissions.has(permission)) {
      return interaction.update({
        content: 'I need the "Manage Channels" and "Manage Roles" permissions to perform a complete setup.',
        components: [],
        ephemeral: true
      });
    }
  }

  // Get linked clan
  const clan = await Clan.findOne({ guildId: interaction.guild.id });

  if (!clan) {
    return interaction.update({
      content: 'You need to link a clan before running the all-in-one setup. Use `/clan link` first.',
      components: [],
      ephemeral: true
    });
  }

  // Show confirmation message with details about what will be created/modified
  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ All-in-One Server Setup')
    .setDescription(`This will set up your entire server for ${clan.name}. Please confirm your choices:`)
    .setColor('#e74c3c')
    .addFields(
      { name: 'Channels & Categories', value: 'Create standard clan categories and channels' },
      { name: 'Roles', value: 'Create and sync roles with clan ranks' },
      { name: 'Permissions', value: 'Set appropriate permissions for all roles' },
      { name: '⚠️ Warning', value: 'Existing channels with the same names will be modified or replaced!' }
    );

  const confirmButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_all')
        .setLabel('Proceed with Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_setup')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  await interaction.update({
    embeds: [confirmEmbed],
    components: [confirmButtons],
    ephemeral: true
  });
}

/**
 * Handle role sync buttons
 * @param {Interaction} interaction - Discord interaction
 * @param {String} customId - Button custom ID
 */
async function handleSyncButtons(interaction, customId) {
  if (customId === 'sync_members') {
    await interaction.update({
      content: 'Starting member role synchronization...',
      components: [],
      ephemeral: true
    });

    try {
      // Get clan data
      const clan = await Clan.findOne({ guildId: interaction.guild.id });
      
      if (!clan) {
        return interaction.editReply({
          content: 'No clan is linked to this server. Please link a clan first with `/clan link`.',
          ephemeral: true
        });
      }

      const clanData = await clashApiService.getClan(clan.clanTag);
      
      if (!clanData || clanData.isPlaceholder) {
        return interaction.editReply({
          content: 'Unable to fetch clan data from the API. Please try again later.',
          ephemeral: true
        });
      }

      // Get Discord roles
      const guild = interaction.guild;
      const roles = guild.roles.cache;
      
      // Get or create clan roles
      const roleMapping = {
        'leader': roles.find(r => r.name === 'Leader') || await guild.roles.create({ name: 'Leader', reason: 'Clash of Clans role sync' }),
        'coLeader': roles.find(r => r.name === 'Co-Leader') || await guild.roles.create({ name: 'Co-Leader', reason: 'Clash of Clans role sync' }),
        'admin': roles.find(r => r.name === 'Co-Leader') || await guild.roles.create({ name: 'Co-Leader', reason: 'Clash of Clans role sync' }), // Map admin to co-leader
        'elder': roles.find(r => r.name === 'Elder') || await guild.roles.create({ name: 'Elder', reason: 'Clash of Clans role sync' }),
        'member': roles.find(r => r.name === 'Member') || await guild.roles.create({ name: 'Member', reason: 'Clash of Clans role sync' }),
        'none': null
      };
      
      // Create progress message
      await interaction.editReply({
        content: `Synchronizing roles with clan ${clanData.name}... This may take a while.`,
        ephemeral: true
      });
      
      // Log for tracking progress
      const successLog = [];
      const errorLog = [];
      const notFoundLog = [];
      
      // Keep track of how many members we find
      let membersFound = 0;
      let membersUpdated = 0;
      
      // Check for linked Discord users
      if (clanData.memberList && clanData.memberList.length > 0) {
        // Get all users linked to this clan
        const linkedUsers = await User.find({ clanTag: clan.clanTag });
        const userMap = new Map();
        
        // Create map of player tags to Discord user IDs
        for (const user of linkedUsers) {
          userMap.set(user.playerTag, user.userId);
        }
        
        // Process each clan member
        for (const member of clanData.memberList) {
          const playerTag = member.tag;
          const userId = userMap.get(playerTag);
          
          if (userId) {
            membersFound++;
            
            try {
              // Get Discord member
              const guildMember = await guild.members.fetch(userId).catch(() => null);
              
              if (guildMember) {
                // Get appropriate role for this clan rank
                const roleToAssign = roleMapping[member.role.toLowerCase()];
                
                if (roleToAssign) {
                  // Check if the member already has the role
                  if (!guildMember.roles.cache.has(roleToAssign.id)) {
                    // Add the role
                    await guildMember.roles.add(roleToAssign, 'Clan role synchronization');
                    
                    // Remove other clan roles
                    for (const [clanRole, roleObj] of Object.entries(roleMapping)) {
                      if (roleObj && roleObj.id !== roleToAssign.id && guildMember.roles.cache.has(roleObj.id)) {
                        await guildMember.roles.remove(roleObj, 'Clan role synchronization');
                      }
                    }
                    
                    successLog.push(`✅ ${member.name}: ${member.role} role assigned`);
                    membersUpdated++;
                  } else {
                    // Already has the correct role
                    successLog.push(`✓ ${member.name}: Already has ${member.role} role`);
                  }
                } else {
                  errorLog.push(`❓ ${member.name}: Unknown role "${member.role}"`);
                }
              } else {
                notFoundLog.push(`⚠️ ${member.name}: User not in this Discord server`);
              }
            } catch (memberError) {
              errorLog.push(`❌ ${member.name}: ${memberError.message}`);
              log.error(`Error updating role for ${member.name}:`, { error: memberError.message });
            }
          } else {
            // No linked Discord user
            notFoundLog.push(`❓ ${member.name}: No linked Discord account`);
          }
        }
      }
      
      // Create summary message
      let syncSummary = `Role synchronization for ${clanData.name}:\n\n`;
      
      syncSummary += `Found ${membersFound} clan members with linked Discord accounts\n`;
      syncSummary += `Updated ${membersUpdated} members with correct clan roles\n\n`;
      
      // Show sample results for each category
      if (successLog.length > 0) {
        syncSummary += "**Successful Updates:**\n";
        for (const msg of successLog.slice(0, 5)) {
          syncSummary += `${msg}\n`;
        }
        if (successLog.length > 5) {
          syncSummary += `And ${successLog.length - 5} more...\n`;
        }
        syncSummary += "\n";
      }
      
      if (errorLog.length > 0) {
        syncSummary += "**Errors:**\n";
        for (const msg of errorLog.slice(0, 3)) {
          syncSummary += `${msg}\n`;
        }
        if (errorLog.length > 3) {
          syncSummary += `And ${errorLog.length - 3} more errors\n`;
        }
        syncSummary += "\n";
      }
      
      if (notFoundLog.length > 0) {
        syncSummary += "**Members Without Discord Link:**\n";
        syncSummary += `${notFoundLog.length} clan members don't have linked Discord accounts\n`;
        syncSummary += "They can link their accounts with `/player link [tag]`\n\n";
      }
      
      if (membersFound === 0) {
        syncSummary += "\n**No linked members found!**\n";
        syncSummary += "Ask your clan members to link their accounts with `/player link [tag]`\n";
      }
      
      // Summary and next steps
      syncSummary += "\n**Next Steps:**\n";
      syncSummary += "- Ask members to link their accounts with `/player link [tag]`\n";
      syncSummary += "- Run role sync regularly to keep roles updated\n";
      syncSummary += "- Configure channel permissions for each role";
      
      await interaction.editReply({
        content: syncSummary,
        ephemeral: true
      });
    } catch (error) {
      log.error('Error synchronizing roles:', { error: error.message });
      await interaction.editReply({
        content: 'An error occurred while synchronizing roles. Please try again later.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle channel setup selection
 * @param {Interaction} interaction - Discord interaction
 * @param {String} value - Selected value
 */
async function handleChannelSetupSelection(interaction, value) {
  switch (value) {
    case 'default_channels':
      await interaction.update({
        content: 'Setting up default channels...',
        components: [],
        ephemeral: true
      });
      
      // Use the existing setupSingleClan method from the setup command
      const setupCommand = interaction.client.commands.get('setup');
      if (setupCommand) {
        await setupCommand.setupSingleClan(interaction);
      }
      break;
      
    case 'custom_channels':
      // Show message about custom channel setup
      await interaction.update({
        content: 'Custom channel setup is currently in development. Please use the default setup for now.',
        components: [],
        ephemeral: true
      });
      break;
      
    case 'family_channels':
      await interaction.update({
        content: 'Setting up family channels...',
        components: [],
        ephemeral: true
      });
      
      // Use the existing setupMultiClan method from the setup command
      const multiSetupCommand = interaction.client.commands.get('setup');
      if (multiSetupCommand) {
        // Default to 2 clans for now
        await multiSetupCommand.setupMultiClan(interaction, 2);
      }
      break;
      
    default:
      await interaction.update({
        content: 'Unknown channel setup option selected.',
        components: [],
        ephemeral: true
      });
      break;
  }
}

/**
 * Handle notification setup selection
 * @param {Interaction} interaction - Discord interaction
 * @param {Array} values - Selected values
 */
async function handleNotificationSetupSelection(interaction, values) {
  await interaction.update({
    content: 'Setting up notifications...',
    components: [],
    ephemeral: true
  });
  
  // For now, just acknowledge the selections
  const selectedTypes = values.map(v => {
    switch (v) {
      case 'war_notifications': return 'War Notifications';
      case 'cwl_notifications': return 'CWL Updates';
      case 'activity_notifications': return 'Member Activity';
      case 'welcome_notifications': return 'Welcome Messages';
      case 'reminder_notifications': return 'Automated Reminders';
      default: return v;
    }
  });
  
  await interaction.editReply({
    content: `Selected notification types: ${selectedTypes.join(', ')}\n\nNotification setup is currently in development.`,
    ephemeral: true
  });
}

/**
 * Handle creation buttons
 * @param {Interaction} interaction - Discord interaction
 * @param {String} customId - Button custom ID
 */
async function handleCreationButtons(interaction, customId) {
  switch (customId) {
    case 'create_roles':
      await interaction.update({
        content: 'Creating roles based on clan ranks...',
        components: [],
        ephemeral: true
      });
      
      try {
        const guild = interaction.guild;
        
        // Create roles if they don't exist
        const roles = ['Leader', 'Co-Leader', 'Elder', 'Member', 'Bot Admin'];
        const createdRoles = [];
        
        for (const roleName of roles) {
          if (!guild.roles.cache.some(role => role.name === roleName)) {
            const newRole = await guild.roles.create({
              name: roleName,
              reason: 'Clan role synchronization'
            });
            createdRoles.push(newRole.name);
          }
        }
        
        if (createdRoles.length > 0) {
          await interaction.editReply({
            content: `Created roles: ${createdRoles.join(', ')}`,
            ephemeral: true
          });
        } else {
          await interaction.editReply({
            content: 'All roles already exist.',
            ephemeral: true
          });
        }
      } catch (error) {
        log.error('Error creating roles:', { error: error.message });
        await interaction.editReply({
          content: 'An error occurred while creating roles. Please try again later.',
          ephemeral: true
        });
      }
      break;
      
    case 'create_all':
      // Handle all-in-one setup confirmation
      await interaction.update({
        content: 'Starting comprehensive server setup...',
        components: [],
        embeds: [],
        ephemeral: true
      });
      
      // Create and configure everything
      try {
        const setupCommand = interaction.client.commands.get('setup');
        if (setupCommand) {
          // Check if we have a linked clan
          const clan = await Clan.findOne({ guildId: interaction.guild.id });
          
          // Additional permission check
          if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) ||
              !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.editReply({
              content: 'I need both the "Manage Channels" and "Manage Roles" permissions to set up the server properly.',
              ephemeral: true
            });
          }

          // Proceed with setup
          await setupCommand.setupSingleClan(interaction);
          
          // Add an extra confirmation message
          await interaction.followUp({
            content: 'Server setup complete! ✅\n\nRecommended next steps:\n1. Use `/clan link [tag]` to link your clan\n2. Set appropriate permissions for each role\n3. Start using the bot commands!',
            ephemeral: true
          });
        } else {
          await interaction.editReply({
            content: 'Could not find the setup command. Please try using `/setup single` directly.',
            ephemeral: true
          });
        }
      } catch (error) {
        log.error('Error in all-in-one setup:', { error: error.message });
        await interaction.editReply({
          content: `An error occurred during the setup process: ${error.message}\n\nSome components may not have been created correctly. Try running the setup command directly with \`/setup single\`.`,
          ephemeral: true
        });
      }
      break;
      
    default:
      await interaction.update({
        content: 'Unknown creation option selected.',
        components: [],
        ephemeral: true
      });
      break;
  }
}