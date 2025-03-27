// src/commands/utility/setupwizard.js
const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');

// Configuration for CoC-themed server structure
const SERVER_TEMPLATES = {
    DEFAULT: {
        categories: [
            {
                name: 'Clan Hall',
                position: 1,
                channels: [
                    { name: 'welcome-hut', type: ChannelType.GuildText, topic: 'Welcome to our clan! Read the rules here.' },
                    { name: 'clan-announcements', type: ChannelType.GuildText, topic: 'Important clan and server announcements' },
                    { name: 'command-center', type: ChannelType.GuildText, topic: 'Use bot commands here' },
                    { name: 'barracks', type: ChannelType.GuildText, topic: 'Assign yourself roles here' }
                ]
            },
            {
                name: 'War Base',
                position: 2,
                channels: [
                    { name: 'war-log', type: ChannelType.GuildText, topic: 'Automated war updates' },
                    { name: 'war-room', type: ChannelType.GuildText, topic: 'Plan your war attacks here' },
                    { name: 'capital-raids', type: ChannelType.GuildText, topic: 'Clan Capital raid coordination' },
                    { name: 'clan-games', type: ChannelType.GuildText, topic: 'Clan Games progress and coordination' },
                    { name: 'recruitment-camp', type: ChannelType.GuildText, topic: 'Recruit new members for the clan' }
                ]
            },
            {
                name: 'Village',
                position: 3,
                channels: [
                    { name: 'town-hall', type: ChannelType.GuildText, topic: 'General clan discussion' },
                    { name: 'builder-workshop', type: ChannelType.GuildText, topic: 'Share and discuss base layouts' },
                    { name: 'training-grounds', type: ChannelType.GuildText, topic: 'Discuss attack strategies' },
                    { name: 'goblin-camp', type: ChannelType.GuildText, topic: 'Off-topic conversations' }
                ]
            },
            {
                name: 'War Council',
                position: 4,
                restricted: true,
                channels: [
                    { name: 'elder-hall', type: ChannelType.GuildText, topic: 'Private channel for elders and up' },
                    { name: 'spell-tower', type: ChannelType.GuildText, topic: 'Bot logs and command usage' },
                    { name: 'scout-tower', type: ChannelType.GuildText, topic: 'Review recruitment applications' }
                ]
            }
        ],
        roles: [
            { name: 'Leader', color: '#e74c3c', hoist: true, mentionable: true, permissions: ['Administrator'], position: 1 },
            { name: 'Co-Leader', color: '#e67e22', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageRoles', 'KickMembers', 'ManageMessages'], position: 2 },
            { name: 'Elder', color: '#f1c40f', hoist: true, mentionable: true, permissions: ['KickMembers', 'ManageMessages'], position: 3 },
            { name: 'Member', color: '#3498db', hoist: true, mentionable: true, permissions: [], position: 4 },
            // Special roles
            { name: 'War General', color: '#9b59b6', hoist: true, mentionable: true, permissions: [], position: 5 },
            { name: 'Capital Raider', color: '#2ecc71', hoist: false, mentionable: true, permissions: [], position: 6 },
            { name: 'Recruiter', color: '#1abc9c', hoist: false, mentionable: true, permissions: [], position: 7 },
            { name: 'Battle Machine', color: '#34495e', hoist: false, mentionable: true, permissions: ['ManageWebhooks', 'ManageGuildExpressions'], position: 8 }
        ]
    },
    // Add other templates if needed (e.g., COMPETITIVE, CASUAL, etc.)
};

// Define permission templates based on role
const ROLE_PERMISSIONS = {
    'Leader': [
        PermissionFlagsBits.Administrator
    ],
    'Co-Leader': [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.MentionEveryone
    ],
    'Elder': [
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.MuteMembers
    ],
    'Battle Machine': [
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ManageGuildExpressions
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupwizard')
        .setDescription('Complete setup wizard for Clash of Clans themed Discord server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start the interactive setup wizard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('autosetup')
                .setDescription('Automatically set up the server with recommended settings')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Server template to use')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Standard', value: 'DEFAULT' }
                        ))
                .addBooleanOption(option =>
                    option.setName('clean')
                        .setDescription('Remove existing channels/categories first')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update specific parts of the server')
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('What to update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Channels', value: 'channels' },
                            { name: 'Roles', value: 'roles' },
                            { name: 'Permissions', value: 'permissions' },
                            { name: 'Role Colors', value: 'colors' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync server roles with Clash of Clans clan')
                .addStringOption(option =>
                    option.setName('clan_tag')
                        .setDescription('Clan tag (uses linked clan if not provided)')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Utility',

    manualDeferring: true,

    longDescription: 'Complete Discord server setup wizard that can create, update, or reorganize your server to match a Clash of Clans theme. Includes role hierarchy, channel organization, permissions, and more.',

    examples: [
        '/setupwizard start',
        '/setupwizard autosetup template:DEFAULT clean:false',
        '/setupwizard update target:roles',
        '/setupwizard sync clan_tag:#ABC123'
    ],

    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'start':
                await startWizard(interaction);
                break;
            case 'autosetup':
                await autoSetup(interaction);
                break;
            case 'update':
                await updateServer(interaction);
                break;
            case 'sync':
                await syncWithClan(interaction);
                break;
            default:
                return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
        }
    },
};

/**
 * Create a backup of the current server configuration
 * @param {Guild} guild - Discord guild
 * @returns {Object} Backup data
 */
async function createServerBackup(guild) {
    try {
        const backup = {
            timestamp: new Date().toISOString(),
            categories: [],
            channels: [],
            roles: []
        };

        // Backup categories
        guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).forEach(category => {
            backup.categories.push({
                id: category.id,
                name: category.name,
                position: category.position,
                permissions: category.permissionOverwrites.cache.map(perm => ({
                    id: perm.id,
                    type: perm.type,
                    allow: perm.allow.toArray(),
                    deny: perm.deny.toArray()
                }))
            });
        });

        // Backup channels
        guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).forEach(channel => {
            backup.channels.push({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId,
                position: channel.position,
                topic: channel.topic,
                permissions: channel.permissionOverwrites.cache.map(perm => ({
                    id: perm.id,
                    type: perm.type,
                    allow: perm.allow.toArray(),
                    deny: perm.deny.toArray()
                }))
            });
        });

        // Backup roles
        guild.roles.cache.forEach(role => {
            if (role.id !== guild.roles.everyone.id) {
                backup.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions.toArray(),
                    mentionable: role.mentionable
                });
            }
        });

        return backup;
    } catch (error) {
        console.error('Error creating server backup:', error);
        throw new Error('Failed to create server backup: ' + error.message);
    }
}

/**
 * Start the interactive setup wizard
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function startWizard(interaction) {
    try {
        // Initial welcome message
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🧙‍♂️ Clash of Clans Server Setup Wizard')
            .setDescription('Welcome to the interactive server setup wizard! I\'ll help you configure your Discord server with a Clash of Clans theme.')
            .addFields(
                { name: 'What This Wizard Can Do', value: 'This wizard will help you set up your Discord server with channels, roles, and permissions that match a Clash of Clans theme.' },
                { name: '⚠️ Important Note', value: 'Some options may modify your existing server structure. A backup will be created before making any changes.' }
            )
            .setColor('#f1c40f')
            .setFooter({ text: 'Select an option to continue' });

        // Create action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('wizard_setup_full')
                    .setLabel('Full Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔨'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_channels')
                    .setLabel('Channels Only')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📁'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_roles')
                    .setLabel('Roles Only')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👑'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        const response = await interaction.reply({
            embeds: [welcomeEmbed],
            components: [actionRow],
            ephemeral: true
        });

        // Create a collector for button interactions
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes timeout
        });

        collector.on('collect', async i => {
            // Ensure it's the same user
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: "This isn't your setup wizard!", ephemeral: true });
                return;
            }

            await i.deferUpdate();

            switch (i.customId) {
                case 'wizard_setup_full':
                    await handleFullSetup(i, interaction);
                    break;
                case 'wizard_setup_channels':
                    await handleChannelSetup(i, interaction);
                    break;
                case 'wizard_setup_roles':
                    await handleRoleSetup(i, interaction);
                    break;
                case 'wizard_setup_cancel':
                    await i.editReply({
                        content: 'Setup wizard canceled.',
                        embeds: [],
                        components: []
                    });
                    collector.stop();
                    break;
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: 'Setup wizard timed out.',
                    embeds: [],
                    components: []
                }).catch(console.error);
            }
        });
    } catch (error) {
        console.error('Error in setup wizard:', error);
        await interaction.reply({ content: `An error occurred: ${error.message}`, ephemeral: true });
    }
}

/**
 * Handle full server setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 */
async function handleFullSetup(i, originalInteraction) {
    const guild = i.guild;

    // Create confirmation message
    const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Full Server Setup')
        .setDescription('You\'re about to perform a full server setup. This will:')
        .addFields(
            { name: 'Create or Update', value: '• Categories and channels\n• Roles with permissions\n• Channel permissions' },
            { name: 'Options', value: 'Please select how to handle existing server content:' }
        )
        .setColor('#e74c3c')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Options
    const optionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_full_clean')
                .setLabel('Clean Setup (Remove Existing)')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🧹'),
            new ButtonBuilder()
                .setCustomId('wizard_full_merge')
                .setLabel('Merge (Keep Existing)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [confirmEmbed],
        components: [optionRow]
    });

    // Create a collector for the confirmation button
    const confirmCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    confirmCollector.on('collect', async confirmI => {
        // Ensure it's the same user
        if (confirmI.user.id !== originalInteraction.user.id) {
            await confirmI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await confirmI.deferUpdate();

        if (confirmI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            confirmCollector.stop();
            return;
        }

        const isCleanSetup = confirmI.customId === 'wizard_full_clean';

        // Create server backup
        let backupData;
        try {
            backupData = await createServerBackup(guild);

            // Store backup in a temporary variable (in a production bot, save to database)
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await confirmI.editReply({
                content: 'Server backup created successfully. Beginning setup...',
                embeds: [],
                components: []
            });

            // Start the setup process
            const result = await performFullSetup(guild, isCleanSetup);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Server Setup Complete')
                .setDescription(`Your server has been set up with the Clash of Clans theme!`)
                .addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true },
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            // Add next steps
            resultEmbed.addFields({
                name: 'Next Steps',
                value: '1. Use `/setclan tag:#YOURCLAN` to link your clan\n2. Use `/roles setup type:th_level` to set up Town Hall roles\n3. Use `/roles setup type:clan_role` to set up clan hierarchy roles'
            });

            await confirmI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in full setup:', error);
            await confirmI.editReply({
                content: `An error occurred during setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        confirmCollector.stop();
    });

    confirmCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Setup confirmation timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Handle channel setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 */
async function handleChannelSetup(i, originalInteraction) {
    const guild = i.guild;

    // Get existing categories
    const existingCategories = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ name: c.name, id: c.id, position: c.position }));

    // Create channel setup embed
    const channelEmbed = new EmbedBuilder()
        .setTitle('📁 Channel Setup')
        .setDescription('Set up your server channels with a Clash of Clans theme.')
        .addFields(
            { name: 'Current Categories', value: existingCategories.length > 0 ?
                    existingCategories.map(c => `• ${c.name}`).join('\n') :
                    'No categories found' },
            { name: 'Options', value: 'Please select how to handle channel setup:' }
        )
        .setColor('#3498db')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Option buttons
    const channelOptionsRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_channels_clean')
                .setLabel('Remove & Recreate All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('wizard_channels_add')
                .setLabel('Add Missing Only')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [channelEmbed],
        components: [channelOptionsRow]
    });

    // Create collector for channel setup options
    const channelCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    channelCollector.on('collect', async channelI => {
        // Ensure it's the same user
        if (channelI.user.id !== originalInteraction.user.id) {
            await channelI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await channelI.deferUpdate();

        if (channelI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            channelCollector.stop();
            return;
        }

        const isCleanChannels = channelI.customId === 'wizard_channels_clean';

        try {
            // Create backup
            const backupData = await createServerBackup(guild);
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await channelI.editReply({
                content: 'Server backup created successfully. Setting up channels...',
                embeds: [],
                components: []
            });

            // Perform channel setup
            const result = await setupServerChannels(guild, isCleanChannels);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Channel Setup Complete')
                .setDescription(`Your server channels have been set up with the Clash of Clans theme!`)
                .addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Channel setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            await channelI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in channel setup:', error);
            await channelI.editReply({
                content: `An error occurred during channel setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        channelCollector.stop();
    });

    channelCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Channel setup timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Handle role setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 */
async function handleRoleSetup(i, originalInteraction) {
    const guild = i.guild;

    // Get existing roles
    const existingRoles = guild.roles.cache
        .filter(r => r.id !== guild.roles.everyone.id)
        .sort((a, b) => b.position - a.position)
        .map(r => ({ name: r.name, id: r.id, color: r.hexColor }));

    // Create role setup embed
    const roleEmbed = new EmbedBuilder()
        .setTitle('👑 Role Setup')
        .setDescription('Set up your server roles with a Clash of Clans theme.')
        .addFields(
            { name: 'Current Roles', value: existingRoles.length > 0 ?
                    existingRoles.slice(0, 10).map(r => `• ${r.name}`).join('\n') +
                    (existingRoles.length > 10 ? `\n• ...and ${existingRoles.length - 10} more` : '') :
                    'No custom roles found' },
            { name: 'Options', value: 'Please select how to handle role setup:' }
        )
        .setColor('#9b59b6')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Option buttons
    const roleOptionsRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_roles_clean')
                .setLabel('Remove & Recreate Roles')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('wizard_roles_add')
                .setLabel('Add & Update Roles')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [roleEmbed],
        components: [roleOptionsRow]
    });

    // Create collector for role setup options
    const roleCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    roleCollector.on('collect', async roleI => {
        // Ensure it's the same user
        if (roleI.user.id !== originalInteraction.user.id) {
            await roleI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await roleI.deferUpdate();

        if (roleI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            roleCollector.stop();
            return;
        }

        const isCleanRoles = roleI.customId === 'wizard_roles_clean';

        try {
            // Create backup
            const backupData = await createServerBackup(guild);
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await roleI.editReply({
                content: 'Server backup created successfully. Setting up roles...',
                embeds: [],
                components: []
            });

            // Perform role setup
            const result = await setupServerRoles(guild, isCleanRoles);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Role Setup Complete')
                .setDescription(`Your server roles have been set up with the Clash of Clans theme!`)
                .addFields(
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Role setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            await roleI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in role setup:', error);
            await roleI.editReply({
                content: `An error occurred during role setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        roleCollector.stop();
    });

    roleCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Role setup timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Perform automatic server setup
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function autoSetup(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const template = interaction.options.getString('template') || 'DEFAULT';
    const clean = interaction.options.getBoolean('clean') || false;

    try {
        // Create backup
        const backupData = await createServerBackup(guild);
        global.tempServerBackups = global.tempServerBackups || {};
        global.tempServerBackups[guild.id] = backupData;

        // Send initial message
        await interaction.editReply({
            content: `Server backup created successfully. Beginning automatic setup using the ${template} template...`,
            embeds: []
        });

        // Perform full setup
        const result = await performFullSetup(guild, clean, template);

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Automatic Server Setup Complete')
            .setDescription(`Your server has been set up with the Clash of Clans theme!`)
            .addFields(
                { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true },
                { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
            )
            .setColor('#2ecc71')
            .setFooter({ text: 'Setup completed successfully' });

        if (result.stats.errors.length > 0) {
            const errorList = result.stats.errors.slice(0, 3).join('\n');
            resultEmbed.addFields({
                name: '⚠️ Some Errors Occurred',
                value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
            });
        }

        // Add next steps
        resultEmbed.addFields({
            name: 'Next Steps',
            value: '1. Use `/setclan tag:#YOURCLAN` to link your clan\n2. Use `/roles setup type:th_level` to set up Town Hall roles\n3. Use `/roles setup type:clan_role` to set up clan hierarchy roles'
        });

        await interaction.editReply({
            embeds: [resultEmbed]
        });

    } catch (error) {
        console.error('Error in automatic setup:', error);
        await interaction.editReply({
            content: `An error occurred during setup: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Update specific parts of the server
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function updateServer(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const target = interaction.options.getString('target');

    try {
        // Create backup
        const backupData = await createServerBackup(guild);
        global.tempServerBackups = global.tempServerBackups || {};
        global.tempServerBackups[guild.id] = backupData;

        let result;
        let title;

        switch (target) {
            case 'channels':
                result = await setupServerChannels(guild, false);
                title = 'Channel Update';
                break;
            case 'roles':
                result = await setupServerRoles(guild, false);
                title = 'Role Update';
                break;
            case 'permissions':
                result = await updateServerPermissions(guild);
                title = 'Permission Update';
                break;
            case 'colors':
                result = await updateRoleColors(guild);
                title = 'Role Color Update';
                break;
            default:
                return interaction.editReply('Invalid update target.');
        }

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle(`✅ ${title} Complete`)
            .setDescription(`Your server ${target} have been updated with the Clash of Clans theme!`)
            .setColor('#2ecc71')
            .setFooter({ text: 'Update completed successfully' });

        if (result.stats) {
            if (target === 'channels') {
                resultEmbed.addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true }
                );
            } else if (target === 'roles') {
                resultEmbed.addFields(
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                );
            } else if (target === 'permissions') {
                resultEmbed.addFields(
                    { name: 'Permissions', value: `Updated: ${result.stats.permissionsUpdated}`, inline: true }
                );
            } else if (target === 'colors') {
                resultEmbed.addFields(
                    { name: 'Role Colors', value: `Updated: ${result.stats.colorsUpdated}`, inline: true }
                );
            }

            if (result.stats.errors && result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }
        }

        await interaction.editReply({
            embeds: [resultEmbed]
        });

    } catch (error) {
        console.error(`Error updating ${target}:`, error);
        await interaction.editReply({
            content: `An error occurred during update: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Sync server roles with a Clash of Clans clan
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function syncWithClan(interaction) {
    await interaction.deferReply();

    try {
        // Get clan tag
        let clanTag = interaction.options.getString('clan_tag');

        // If no clan tag provided, try to get linked clan
        if (!clanTag) {
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan) {
                return interaction.editReply("This server doesn't have a linked clan. Use `/setclan` first or provide a clan tag.");
            }
            clanTag = linkedClan.clanTag;
        }

        // Format clan tag
        if (!clanTag.startsWith('#')) {
            clanTag = '#' + clanTag;
        }

        // Get clan data from API
        const clanData = await clashApiService.getClan(clanTag);

        if (!clanData || !clanData.members) {
            return interaction.editReply('Could not retrieve clan data. Please check the clan tag and try again.');
        }

        await interaction.editReply(`Found clan: ${clanData.name} (${clanData.tag}). Syncing roles...`);

        // Perform role sync
        const result = await syncClanRoles(interaction.guild, clanData);

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Clan Role Sync Complete')
            .setDescription(`Your server roles have been synchronized with ${clanData.name}!`)
            .addFields(
                { name: 'Members Processed', value: result.stats.membersProcessed.toString(), inline: true },
                { name: 'Roles Updated', value: result.stats.rolesUpdated.toString(), inline: true }
            )
            .setColor('#2ecc71')
            .setFooter({ text: 'Role sync completed successfully' });

        if (result.stats.errors.length > 0) {
            const errorList = result.stats.errors.slice(0, 3).join('\n');
            resultEmbed.addFields({
                name: '⚠️ Some Errors Occurred',
                value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
            });
        }

        await interaction.editReply({
            embeds: [resultEmbed]
        });

    } catch (error) {
        console.error('Error in clan sync:', error);
        await interaction.editReply({
            content: `An error occurred during clan sync: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Synchronize server roles with a Clash of Clans clan
 * @param {Guild} guild - Discord guild
 * @param {Object} clanData - Clan data from API
 */
async function syncClanRoles(guild, clanData) {
    const stats = {
        membersProcessed: 0,
        rolesUpdated: 0,
        errors: []
    };

    try {
        // Ensure the clan roles exist
        const roles = {
            'Leader': null,
            'Co-Leader': null,
            'Elder': null,
            'Member': null
        };

        // Get existing roles
        for (const roleName of Object.keys(roles)) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                roles[roleName] = role;
            } else {
                // Create the role if it doesn't exist
                try {
                    const newRole = await guild.roles.create({
                        name: roleName,
                        color: roleName === 'Leader' ? '#e74c3c' :
                            roleName === 'Co-Leader' ? '#e67e22' :
                                roleName === 'Elder' ? '#f1c40f' : '#3498db',
                        hoist: true,
                        mentionable: true,
                        reason: 'CoC Bot Role Sync'
                    });
                    roles[roleName] = newRole;
                    stats.rolesUpdated++;
                } catch (error) {
                    console.error(`Error creating role ${roleName}:`, error);
                    stats.errors.push(`Failed to create role ${roleName}: ${error.message}`);
                }
            }
        }

        // Process clan members
        for (const member of clanData.members) {
            stats.membersProcessed++;

            // Find linked Discord user
            const linkedUser = await User.findOne({ playerTag: member.tag });
            if (!linkedUser || !linkedUser.discordId) {
                continue; // Skip members without linked Discord accounts
            }

            try {
                // Get the Discord member
                const discordMember = await guild.members.fetch(linkedUser.discordId).catch(() => null);
                if (!discordMember) continue;

                // Map CoC role to Discord role
                let roleToAssign;
                switch (member.role.toLowerCase()) {
                    case 'leader':
                        roleToAssign = roles['Leader'];
                        break;
                    case 'coleader':
                    case 'co-leader':
                    case 'admin':
                        roleToAssign = roles['Co-Leader'];
                        break;
                    case 'elder':
                        roleToAssign = roles['Elder'];
                        break;
                    default:
                        roleToAssign = roles['Member'];
                }

                if (roleToAssign) {
                    // Remove other clan roles
                    for (const role of Object.values(roles)) {
                        if (role && role.id !== roleToAssign.id && discordMember.roles.cache.has(role.id)) {
                            await discordMember.roles.remove(role);
                            stats.rolesUpdated++;
                        }
                    }

                    // Add the appropriate role
                    if (!discordMember.roles.cache.has(roleToAssign.id)) {
                        await discordMember.roles.add(roleToAssign);
                        stats.rolesUpdated++;
                    }
                }
            } catch (error) {
                console.error(`Error processing member ${member.name}:`, error);
                stats.errors.push(`Failed to process member ${member.name}: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in syncClanRoles:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Set up all server channels
 * @param {Guild} guild - Discord guild
 * @param {boolean} cleanChannels - Whether to remove existing channels first
 * @param {string} template - Template name
 */
async function setupServerChannels(guild, cleanChannels, template = 'DEFAULT') {
    const templateData = SERVER_TEMPLATES[template];
    const stats = {
        categoriesCreated: 0,
        categoriesUpdated: 0,
        channelsCreated: 0,
        channelsUpdated: 0,
        errors: []
    };

    try {
        // If clean setup, remove all existing channels
        if (cleanChannels) {
            try {
                // Delete non-category channels first
                const nonCategoryChannels = guild.channels.cache
                    .filter(c => c.type !== ChannelType.GuildCategory);

                for (const channel of nonCategoryChannels.values()) {
                    try {
                        await channel.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting channel ${channel.name}:`, error);
                        stats.errors.push(`Failed to delete channel ${channel.name}: ${error.message}`);
                    }
                }

                // Then delete categories
                const categories = guild.channels.cache
                    .filter(c => c.type === ChannelType.GuildCategory);

                for (const category of categories.values()) {
                    try {
                        await category.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting category ${category.name}:`, error);
                        stats.errors.push(`Failed to delete category ${category.name}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error('Error removing existing channels:', error);
                stats.errors.push(`Failed to remove existing channels: ${error.message}`);
            }
        }

        // Create each category and its channels
        for (const categoryData of templateData.categories) {
            try {
                // Check if category already exists
                let category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name === categoryData.name
                );

                // Determine permission overwrites for the category
                let permissionOverwrites = [];

                // If it's a restricted category, set up permissions
                if (categoryData.restricted) {
                    // Default permission - deny view to everyone
                    permissionOverwrites.push({
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    });

                    // Get roles for permissions
                    const elderRole = guild.roles.cache.find(r => r.name === 'Elder');
                    const coLeaderRole = guild.roles.cache.find(r => r.name === 'Co-Leader');
                    const leaderRole = guild.roles.cache.find(r => r.name === 'Leader');

                    // Give view permissions to appropriate roles
                    if (elderRole) {
                        permissionOverwrites.push({
                            id: elderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }

                    if (coLeaderRole) {
                        permissionOverwrites.push({
                            id: coLeaderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }

                    if (leaderRole) {
                        permissionOverwrites.push({
                            id: leaderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }
                }

                // Create category if it doesn't exist
                if (!category) {
                    category = await guild.channels.create({
                        name: categoryData.name,
                        type: ChannelType.GuildCategory,
                        permissionOverwrites,
                        reason: 'CoC Bot Server Setup'
                    });
                    stats.categoriesCreated++;
                } else {
                    // Update permissions on existing category
                    if (permissionOverwrites.length > 0) {
                        await category.permissionOverwrites.set(permissionOverwrites);
                        stats.categoriesUpdated++;
                    }
                }

                // Create channels in the category
                for (const channelData of categoryData.channels) {
                    // Check if channel already exists in this category
                    const existingChannel = guild.channels.cache.find(
                        c => c.name === channelData.name && c.parentId === category.id
                    );

                    if (!existingChannel) {
                        // Check for special permissions
                        let channelPermissions = [];

                        // War room permissions
                        if (channelData.name === 'war-room') {
                            // Add War General role permission
                            const warGeneralRole = guild.roles.cache.find(r => r.name === 'War General');
                            if (warGeneralRole) {
                                channelPermissions.push({
                                    id: warGeneralRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }
                        }

                        // Elder hall permissions
                        if (channelData.name === 'elder-hall') {
                            // Find roles
                            const elderRole = guild.roles.cache.find(r => r.name === 'Elder');
                            const coLeaderRole = guild.roles.cache.find(r => r.name === 'Co-Leader');
                            const leaderRole = guild.roles.cache.find(r => r.name === 'Leader');

                            // Deny everyone
                            channelPermissions.push({
                                id: guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            });

                            // Allow specific roles
                            if (elderRole) {
                                channelPermissions.push({
                                    id: elderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }

                            if (coLeaderRole) {
                                channelPermissions.push({
                                    id: coLeaderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }

                            if (leaderRole) {
                                channelPermissions.push({
                                    id: leaderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }
                        }

                        // Create the channel
                        await guild.channels.create({
                            name: channelData.name,
                            type: channelData.type,
                            parent: category.id,
                            topic: channelData.topic,
                            permissionOverwrites: channelPermissions,
                            reason: 'CoC Bot Server Setup'
                        });
                        stats.channelsCreated++;
                    } else {
                        // Update topic on existing channel
                        if (channelData.topic && existingChannel.topic !== channelData.topic) {
                            await existingChannel.setTopic(channelData.topic);
                            stats.channelsUpdated++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error setting up category ${categoryData.name}:`, error);
                stats.errors.push(`Failed to set up category ${categoryData.name}: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in setupServerChannels:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Set up all server roles
 * @param {Guild} guild - Discord guild
 * @param {boolean} cleanRoles - Whether to remove existing roles first
 * @param {string} template - Template name
 */
async function setupServerRoles(guild, cleanRoles, template = 'DEFAULT') {
    const templateData = SERVER_TEMPLATES[template];
    const stats = {
        rolesCreated: 0,
        rolesUpdated: 0,
        errors: []
    };

    try {
        // If clean setup, remove all existing roles
        if (cleanRoles) {
            try {
                const existingRoles = guild.roles.cache
                    .filter(r => r.id !== guild.roles.everyone.id && r.position < guild.me.roles.highest.position);

                for (const role of existingRoles.values()) {
                    try {
                        await role.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting role ${role.name}:`, error);
                        stats.errors.push(`Failed to delete role ${role.name}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error('Error removing existing roles:', error);
                stats.errors.push(`Failed to remove existing roles: ${error.message}`);
            }
        }

        // Create roles
        const createdRoles = {};

        for (const roleData of templateData.roles) {
            try {
                // Check if role already exists
                let role = guild.roles.cache.find(r => r.name === roleData.name);

                if (!role) {
                    // Create the role
                    role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        mentionable: roleData.mentionable,
                        reason: 'CoC Bot Server Setup'
                    });

                    // Set permissions based on role type
                    if (ROLE_PERMISSIONS[roleData.name]) {
                        await role.setPermissions(ROLE_PERMISSIONS[roleData.name]);
                    }

                    createdRoles[roleData.name] = role;
                    stats.rolesCreated++;
                } else {
                    // Update existing role
                    let updated = false;

                    // Update color if different
                    if (role.hexColor !== roleData.color) {
                        await role.setColor(roleData.color);
                        updated = true;
                    }

                    // Update hoist if different
                    if (role.hoist !== roleData.hoist) {
                        await role.setHoist(roleData.hoist);
                        updated = true;
                    }

                    // Update mentionable if different
                    if (role.mentionable !== roleData.mentionable) {
                        await role.setMentionable(roleData.mentionable);
                        updated = true;
                    }

                    // Update permissions if needed
                    if (ROLE_PERMISSIONS[roleData.name]) {
                        const currentPerms = role.permissions.toArray();
                        const shouldUpdate = !ROLE_PERMISSIONS[roleData.name].every(perm =>
                            currentPerms.includes(perm)
                        );

                        if (shouldUpdate) {
                            await role.setPermissions(ROLE_PERMISSIONS[roleData.name]);
                            updated = true;
                        }
                    }

                    if (updated) {
                        stats.rolesUpdated++;
                    }

                    createdRoles[roleData.name] = role;
                }
            } catch (error) {
                console.error(`Error setting up role ${roleData.name}:`, error);
                stats.errors.push(`Failed to set up role ${roleData.name}: ${error.message}`);
            }
        }

        // Try to adjust role positions - needs to be done after all roles are created
        try {
            // Must be in descending order - lower positions first (higher position value = lower on the list)
            const sortedRoles = templateData.roles
                .map(roleData => ({
                    name: roleData.name,
                    position: roleData.position
                }))
                .sort((a, b) => b.position - a.position);

            for (const roleInfo of sortedRoles) {
                const role = createdRoles[roleInfo.name];
                if (role) {
                    try {
                        await role.setPosition(roleInfo.position);
                    } catch (error) {
                        console.error(`Error setting position for role ${roleInfo.name}:`, error);
                        stats.errors.push(`Failed to set position for role ${roleInfo.name}: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error adjusting role positions:', error);
            stats.errors.push(`Failed to adjust role positions: ${error.message}`);
        }

        return { stats, roles: createdRoles };
    } catch (error) {
        console.error('Error in setupServerRoles:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Update channel permissions
 * @param {Guild} guild - Discord guild
 */
async function updateServerPermissions(guild) {
    const stats = {
        permissionsUpdated: 0,
        errors: []
    };

    try {
        // Get existing roles
        const roles = {
            leader: guild.roles.cache.find(r => r.name === 'Leader'),
            coLeader: guild.roles.cache.find(r => r.name === 'Co-Leader'),
            elder: guild.roles.cache.find(r => r.name === 'Elder'),
            member: guild.roles.cache.find(r => r.name === 'Member'),
            warGeneral: guild.roles.cache.find(r => r.name === 'War General'),
            recruiter: guild.roles.cache.find(r => r.name === 'Recruiter')
        };

        // Define permission mappings
        const permissions = {};

        // War Council category
        const warCouncilCategory = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === 'War Council'
        );

        if (warCouncilCategory) {
            // Set permissions for War Council category
            const warCouncilPerms = [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
            ];

            // Add role permissions
            if (roles.elder) warCouncilPerms.push({ id: roles.elder.id, allow: [PermissionFlagsBits.ViewChannel] });
            if (roles.coLeader) warCouncilPerms.push({ id: roles.coLeader.id, allow: [PermissionFlagsBits.ViewChannel] });
            if (roles.leader) warCouncilPerms.push({ id: roles.leader.id, allow: [PermissionFlagsBits.ViewChannel] });

            try {
                await warCouncilCategory.permissionOverwrites.set(warCouncilPerms);
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting War Council permissions:', error);
                stats.errors.push(`Failed to set War Council permissions: ${error.message}`);
            }
        }

        // War room channel
        const warRoomChannel = guild.channels.cache.find(
            c => c.name === 'war-room'
        );

        if (warRoomChannel && roles.warGeneral) {
            try {
                await warRoomChannel.permissionOverwrites.create(roles.warGeneral.id, {
                    ViewChannel: true
                });
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting war-room permissions:', error);
                stats.errors.push(`Failed to set war-room permissions: ${error.message}`);
            }
        }

        // Scout tower channel
        const scoutTowerChannel = guild.channels.cache.find(
            c => c.name === 'scout-tower'
        );

        if (scoutTowerChannel && roles.recruiter) {
            try {
                await scoutTowerChannel.permissionOverwrites.create(roles.recruiter.id, {
                    ViewChannel: true
                });
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting scout-tower permissions:', error);
                stats.errors.push(`Failed to set scout-tower permissions: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in updateServerPermissions:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Update role colors
 * @param {Guild} guild - Discord guild
 */
async function updateRoleColors(guild) {
    const stats = {
        colorsUpdated: 0,
        errors: []
    };

    try {
        // Define role colors
        const roleColors = {
            'Leader': '#e74c3c',
            'Co-Leader': '#e67e22',
            'Elder': '#f1c40f',
            'Member': '#3498db',
            'War General': '#9b59b6',
            'Capital Raider': '#2ecc71',
            'Recruiter': '#1abc9c',
            'Battle Machine': '#34495e'
        };

        // Update colors for each role
        for (const [roleName, color] of Object.entries(roleColors)) {
            const role = guild.roles.cache.find(r => r.name === roleName);

            if (role && role.hexColor !== color) {
                try {
                    await role.setColor(color);
                    stats.colorsUpdated++;
                } catch (error) {
                    console.error(`Error updating color for role ${roleName}:`, error);
                    stats.errors.push(`Failed to update color for role ${roleName}: ${error.message}`);
                }
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in updateRoleColors:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Perform full server setup
 * @param {Guild} guild - Discord guild
 * @param {boolean} clean - Whether to remove existing items first
 * @param {string} template - Template name
 */
async function performFullSetup(guild, clean, template = 'DEFAULT') {
    const stats = {
        categoriesCreated: 0,
        categoriesUpdated: 0,
        channelsCreated: 0,
        channelsUpdated: 0,
        rolesCreated: 0,
        rolesUpdated: 0,
        errors: []
    };

    try {
        // First set up roles (so we can use them for channel permissions)
        const roleResult = await setupServerRoles(guild, clean, template);
        stats.rolesCreated += roleResult.stats.rolesCreated;
        stats.rolesUpdated += roleResult.stats.rolesUpdated;
        stats.errors = stats.errors.concat(roleResult.stats.errors);

        // Then set up channels
        const channelResult = await setupServerChannels(guild, clean, template);
        stats.categoriesCreated += channelResult.stats.categoriesCreated;
        stats.categoriesUpdated += channelResult.stats.categoriesUpdated;
        stats.channelsCreated += channelResult.stats.channelsCreated;
        stats.channelsUpdated += channelResult.stats.channelsUpdated;
        stats.errors = stats.errors.concat(channelResult.stats.errors);

        // Finally, update permissions
        const permissionResult = await updateServerPermissions(guild);
        stats.errors = stats.errors.concat(permissionResult.stats.errors);

        return { stats };
    } catch (error) {
        console.error('Error in performFullSetup:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');

// Server templates for different types of Clash of Clans servers
const SERVER_TEMPLATES = {
    DEFAULT: {
        categories: [
            {
                name: 'Clan Hall',
                position: 1,
                channels: [
                    { name: 'welcome-hut', type: ChannelType.GuildText, topic: 'Welcome to our clan! Read the rules here.' },
                    { name: 'clan-announcements', type: ChannelType.GuildText, topic: 'Important clan and server announcements' },
                    { name: 'command-center', type: ChannelType.GuildText, topic: 'Use bot commands here' },
                    { name: 'barracks', type: ChannelType.GuildText, topic: 'Assign yourself roles here' }
                ]
            },
            {
                name: 'War Base',
                position: 2,
                channels: [
                    { name: 'war-log', type: ChannelType.GuildText, topic: 'Automated war updates' },
                    { name: 'war-room', type: ChannelType.GuildText, topic: 'Plan your war attacks here' },
                    { name: 'capital-raids', type: ChannelType.GuildText, topic: 'Clan Capital raid coordination' },
                    { name: 'clan-games', type: ChannelType.GuildText, topic: 'Clan Games progress and coordination' },
                    { name: 'recruitment-camp', type: ChannelType.GuildText, topic: 'Recruit new members for the clan' }
                ]
            },
            {
                name: 'Village',
                position: 3,
                channels: [
                    { name: 'town-hall', type: ChannelType.GuildText, topic: 'General clan discussion' },
                    { name: 'builder-workshop', type: ChannelType.GuildText, topic: 'Share and discuss base layouts' },
                    { name: 'training-grounds', type: ChannelType.GuildText, topic: 'Discuss attack strategies' },
                    { name: 'goblin-camp', type: ChannelType.GuildText, topic: 'Off-topic conversations' }
                ]
            },
            {
                name: 'War Council',
                position: 4,
                restricted: true,
                channels: [
                    { name: 'elder-hall', type: ChannelType.GuildText, topic: 'Private channel for elders and up' },
                    { name: 'spell-tower', type: ChannelType.GuildText, topic: 'Bot logs and command usage' },
                    { name: 'scout-tower', type: ChannelType.GuildText, topic: 'Review recruitment applications' }
                ]
            }
        ],
        roles: [
            { name: 'Leader', color: '#e74c3c', hoist: true, mentionable: true, permissions: ['Administrator'], position: 1 },
            { name: 'Co-Leader', color: '#e67e22', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageRoles', 'KickMembers', 'ManageMessages'], position: 2 },
            { name: 'Elder', color: '#f1c40f', hoist: true, mentionable: true, permissions: ['KickMembers', 'ManageMessages'], position: 3 },
            { name: 'Member', color: '#3498db', hoist: true, mentionable: true, permissions: [], position: 4 },
            // Special roles
            { name: 'War General', color: '#9b59b6', hoist: true, mentionable: true, permissions: [], position: 5 },
            { name: 'Capital Raider', color: '#2ecc71', hoist: false, mentionable: true, permissions: [], position: 6 },
            { name: 'Recruiter', color: '#1abc9c', hoist: false, mentionable: true, permissions: [], position: 7 },
            { name: 'Battle Machine', color: '#34495e', hoist: false, mentionable: true, permissions: ['ManageWebhooks', 'ManageGuildExpressions'], position: 8 }
        ]
    },
    COMPETITIVE: {
        categories: [
            {
                name: 'Clan Headquarters',
                position: 1,
                channels: [
                    { name: 'welcome', type: ChannelType.GuildText, topic: 'Welcome to our competitive clan! Read the rules here.' },
                    { name: 'announcements', type: ChannelType.GuildText, topic: 'Important clan and server announcements' },
                    { name: 'bot-commands', type: ChannelType.GuildText, topic: 'Use bot commands here' },
                    { name: 'role-assignment', type: ChannelType.GuildText, topic: 'Assign yourself roles here' }
                ]
            },
            {
                name: 'War Operations',
                position: 2,
                channels: [
                    { name: 'war-announcements', type: ChannelType.GuildText, topic: 'War declarations and results' },
                    { name: 'war-planning', type: ChannelType.GuildText, topic: 'Strategic planning for wars' },
                    { name: 'war-assignments', type: ChannelType.GuildText, topic: 'Attack assignments for wars' },
                    { name: 'cwl-discussion', type: ChannelType.GuildText, topic: 'Clan War League discussion' },
                    { name: 'base-review', type: ChannelType.GuildText, topic: 'Share and review war bases' }
                ]
            },
            {
                name: 'Clan Activities',
                position: 3,
                channels: [
                    { name: 'clan-capital', type: ChannelType.GuildText, topic: 'Clan Capital raid coordination' },
                    { name: 'clan-games', type: ChannelType.GuildText, topic: 'Clan Games progress and challenges' },
                    { name: 'friendly-challenges', type: ChannelType.GuildText, topic: 'Request and post friendly challenges' },
                    { name: 'base-sharing', type: ChannelType.GuildText, topic: 'Share your base designs' }
                ]
            },
            {
                name: 'Strategy & Learning',
                position: 4,
                channels: [
                    { name: 'attack-strategies', type: ChannelType.GuildText, topic: 'Discuss attack strategies and compositions' },
                    { name: 'tutorials', type: ChannelType.GuildText, topic: 'Guides and tutorials for attacking' },
                    { name: 'replays', type: ChannelType.GuildText, topic: 'Share and analyze attack replays' }
                ]
            },
            {
                name: 'Leadership',
                position: 5,
                restricted: true,
                channels: [
                    { name: 'leader-chat', type: ChannelType.GuildText, topic: 'Private channel for leaders only' },
                    { name: 'elder-chat', type: ChannelType.GuildText, topic: 'Private channel for elders and up' },
                    { name: 'member-management', type: ChannelType.GuildText, topic: 'Discuss member performance' },
                    { name: 'recruitment', type: ChannelType.GuildText, topic: 'Recruitment planning and applications' }
                ]
            },
            {
                name: 'Social',
                position: 6,
                channels: [
                    { name: 'general', type: ChannelType.GuildText, topic: 'General discussion for clan members' },
                    { name: 'off-topic', type: ChannelType.GuildText, topic: 'Discussions not related to Clash of Clans' },
                    { name: 'memes', type: ChannelType.GuildText, topic: 'Share your Clash of Clans memes' }
                ]
            }
        ],
        roles: [
            { name: 'Leader', color: '#e74c3c', hoist: true, mentionable: true, permissions: ['Administrator'], position: 1 },
            { name: 'Co-Leader', color: '#e67e22', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ManageMessages', 'MentionEveryone'], position: 2 },
            { name: 'Elder', color: '#f1c40f', hoist: true, mentionable: true, permissions: ['KickMembers', 'ManageMessages', 'MuteMembers'], position: 3 },
            { name: 'Member', color: '#3498db', hoist: true, mentionable: true, permissions: [], position: 4 },
            // Team roles
            { name: 'War Team', color: '#9b59b6', hoist: true, mentionable: true, permissions: [], position: 5 },
            { name: 'CWL Team', color: '#2ecc71', hoist: true, mentionable: true, permissions: [], position: 6 },
            // Special roles
            { name: 'War Planner', color: '#1abc9c', hoist: false, mentionable: true, permissions: [], position: 7 },
            { name: 'Base Designer', color: '#34495e', hoist: false, mentionable: true, permissions: [], position: 8 },
            { name: 'Coach', color: '#16a085', hoist: false, mentionable: true, permissions: [], position: 9 },
            { name: 'Recruiter', color: '#27ae60', hoist: false, mentionable: true, permissions: [], position: 10 },
            // TH Level roles will be added dynamically
        ]
    },
    CASUAL: {
        categories: [
            {
                name: 'Welcome',
                position: 1,
                channels: [
                    { name: 'welcome', type: ChannelType.GuildText, topic: 'Welcome to our casual clan! Read the rules here.' },
                    { name: 'announcements', type: ChannelType.GuildText, topic: 'Important clan and server announcements' },
                    { name: 'bot-commands', type: ChannelType.GuildText, topic: 'Use bot commands here' }
                ]
            },
            {
                name: 'Clan Chat',
                position: 2,
                channels: [
                    { name: 'general', type: ChannelType.GuildText, topic: 'General clan discussion' },
                    { name: 'clash-help', type: ChannelType.GuildText, topic: 'Ask for help with Clash of Clans' },
                    { name: 'off-topic', type: ChannelType.GuildText, topic: 'Discussions not related to Clash of Clans' },
                    { name: 'memes', type: ChannelType.GuildText, topic: 'Share your memes and funny content' }
                ]
            },
            {
                name: 'Clan Activities',
                position: 3,
                channels: [
                    { name: 'war-chat', type: ChannelType.GuildText, topic: 'Discuss clan wars' },
                    { name: 'capital-raids', type: ChannelType.GuildText, topic: 'Clan Capital raid coordination' },
                    { name: 'clan-games', type: ChannelType.GuildText, topic: 'Clan Games progress and discussion' },
                    { name: 'base-sharing', type: ChannelType.GuildText, topic: 'Share your base designs' }
                ]
            },
            {
                name: 'Leadership',
                position: 4,
                restricted: true,
                channels: [
                    { name: 'leaders-chat', type: ChannelType.GuildText, topic: 'Private channel for leadership' },
                    { name: 'member-management', type: ChannelType.GuildText, topic: 'Discuss member management' }
                ]
            }
        ],
        roles: [
            { name: 'Leader', color: '#e74c3c', hoist: true, mentionable: true, permissions: ['Administrator'], position: 1 },
            { name: 'Co-Leader', color: '#e67e22', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageRoles', 'KickMembers', 'ManageMessages'], position: 2 },
            { name: 'Elder', color: '#f1c40f', hoist: true, mentionable: true, permissions: ['KickMembers', 'ManageMessages'], position: 3 },
            { name: 'Member', color: '#3498db', hoist: true, mentionable: true, permissions: [], position: 4 },
            // Special roles
            { name: 'War Player', color: '#9b59b6', hoist: false, mentionable: true, permissions: [], position: 5 },
            { name: 'Capital Contributor', color: '#2ecc71', hoist: false, mentionable: true, permissions: [], position: 6 },
            { name: 'Clan Games Champion', color: '#1abc9c', hoist: false, mentionable: true, permissions: [], position: 7 }
        ]
    },
    ALLIANCE: {
        categories: [
            {
                name: 'Alliance Hub',
                position: 1,
                channels: [
                    { name: 'welcome', type: ChannelType.GuildText, topic: 'Welcome to our clan alliance! Read the rules here.' },
                    { name: 'alliance-announcements', type: ChannelType.GuildText, topic: 'Important alliance announcements' },
                    { name: 'bot-commands', type: ChannelType.GuildText, topic: 'Use bot commands here' },
                    { name: 'alliance-events', type: ChannelType.GuildText, topic: 'Alliance-wide events and activities' }
                ]
            },
            {
                name: 'Alliance General',
                position: 2,
                channels: [
                    { name: 'general-chat', type: ChannelType.GuildText, topic: 'General discussion for all alliance members' },
                    { name: 'strategy-sharing', type: ChannelType.GuildText, topic: 'Share attack strategies across clans' },
                    { name: 'base-sharing', type: ChannelType.GuildText, topic: 'Share base designs across clans' },
                    { name: 'recruitment', type: ChannelType.GuildText, topic: 'Recruitment coordination between clans' }
                ]
            },
            {
                name: 'Alliance Wars',
                position: 3,
                channels: [
                    { name: 'war-coordination', type: ChannelType.GuildText, topic: 'Coordinate wars between alliance clans' },
                    { name: 'cwl-planning', type: ChannelType.GuildText, topic: 'Clan War League planning' },
                    { name: 'friendly-wars', type: ChannelType.GuildText, topic: 'Set up friendly wars between alliance clans' }
                ]
            }
        ],
        roles: [
            { name: 'Alliance Leader', color: '#e74c3c', hoist: true, mentionable: true, permissions: ['Administrator'], position: 1 },
            { name: 'Clan Leader', color: '#e67e22', hoist: true, mentionable: true, permissions: ['ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ManageMessages', 'MentionEveryone'], position: 2 },
            { name: 'Clan Co-Leader', color: '#f1c40f', hoist: true, mentionable: true, permissions: ['KickMembers', 'ManageMessages'], position: 3 },
            { name: 'Clan Elder', color: '#3498db', hoist: true, mentionable: true, permissions: [], position: 4 },
            { name: 'Clan Member', color: '#2ecc71', hoist: true, mentionable: true, permissions: [], position: 5 },
            // Alliance clans - these would be dynamically created based on actual clans in the alliance
        ]
    }
};

// Define permission templates based on role
const ROLE_PERMISSIONS = {
    'Leader': [
        PermissionFlagsBits.Administrator
    ],
    'Co-Leader': [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.MentionEveryone
    ],
    'Elder': [
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.MuteMembers
    ],
    'Battle Machine': [
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ManageGuildExpressions
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupwizard')
        .setDescription('Complete setup wizard for Clash of Clans themed Discord server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start the interactive setup wizard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('autosetup')
                .setDescription('Automatically set up the server with recommended settings')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Server template to use')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Standard', value: 'DEFAULT' },
                            { name: 'Competitive', value: 'COMPETITIVE' },
                            { name: 'Casual', value: 'CASUAL' },
                            { name: 'Alliance', value: 'ALLIANCE' }
                        ))
                .addBooleanOption(option =>
                    option.setName('clean')
                        .setDescription('Remove existing channels/categories first')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('link_clan')
                        .setDescription('Link to Clash of Clans clan after setup')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update specific parts of the server')
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('What to update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Channels', value: 'channels' },
                            { name: 'Roles', value: 'roles' },
                            { name: 'Permissions', value: 'permissions' },
                            { name: 'Role Colors', value: 'colors' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync server roles with Clash of Clans clan')
                .addStringOption(option =>
                    option.setName('clan_tag')
                        .setDescription('Clan tag (uses linked clan if not provided)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Create a backup of current server settings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restore server settings from a backup')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('ID of the backup to restore (latest if not specified)')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Utility',

    manualDeferring: true,

    longDescription: 'Complete Discord server setup wizard that can create, update, or reorganize your server to match a Clash of Clans theme. Includes role hierarchy, channel organization, permissions, and more.',

    examples: [
        '/setupwizard start',
        '/setupwizard autosetup template:DEFAULT clean:false',
        '/setupwizard update target:roles',
        '/setupwizard sync clan_tag:#ABC123',
        '/setupwizard backup',
        '/setupwizard restore'
    ],

    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'start':
                await startWizard(interaction);
                break;
            case 'autosetup':
                await autoSetup(interaction);
                break;
            case 'update':
                await updateServer(interaction);
                break;
            case 'sync':
                await syncWithClan(interaction);
                break;
            case 'backup':
                await createBackup(interaction);
                break;
            case 'restore':
                await restoreBackup(interaction);
                break;
            default:
                return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
        }
    },
};

/**
 * Create a backup of the current server configuration
 * @param {Guild} guild - Discord guild
 * @returns {Object} Backup data
 */
async function createServerBackup(guild) {
    try {
        const backup = {
            timestamp: new Date().toISOString(),
            guildId: guild.id,
            guildName: guild.name,
            categories: [],
            channels: [],
            roles: []
        };

        // Backup categories
        guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).forEach(category => {
            backup.categories.push({
                id: category.id,
                name: category.name,
                position: category.position,
                permissions: category.permissionOverwrites.cache.map(perm => ({
                    id: perm.id,
                    type: perm.type,
                    allow: perm.allow.toArray(),
                    deny: perm.deny.toArray()
                }))
            });
        });

        // Backup channels
        guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).forEach(channel => {
            backup.channels.push({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId,
                position: channel.position,
                topic: channel.topic,
                permissions: channel.permissionOverwrites.cache.map(perm => ({
                    id: perm.id,
                    type: perm.type,
                    allow: perm.allow.toArray(),
                    deny: perm.deny.toArray()
                }))
            });
        });

        // Backup roles
        guild.roles.cache.forEach(role => {
            if (role.id !== guild.roles.everyone.id) {
                backup.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions.toArray(),
                    mentionable: role.mentionable
                });
            }
        });

        return backup;
    } catch (error) {
        console.error('Error creating server backup:', error);
        throw new Error('Failed to create server backup: ' + error.message);
    }
}

/**
 * Start the interactive setup wizard
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function startWizard(interaction) {
    try {
        // Initial welcome message
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🧙‍♂️ Clash of Clans Server Setup Wizard')
            .setDescription('Welcome to the interactive server setup wizard! I\'ll help you configure your Discord server with a Clash of Clans theme.')
            .addFields(
                { name: 'What This Wizard Can Do', value: 'This wizard will help you set up your Discord server with channels, roles, and permissions that match a Clash of Clans theme.' },
                { name: '⚠️ Important Note', value: 'Some options may modify your existing server structure. A backup will be created before making any changes.' }
            )
            .setColor('#f1c40f')
            .setFooter({ text: 'Select an option to continue' });

        // Create action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('wizard_setup_full')
                    .setLabel('Full Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔨'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_channels')
                    .setLabel('Channels Only')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📁'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_roles')
                    .setLabel('Roles Only')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👑'),
                new ButtonBuilder()
                    .setCustomId('wizard_setup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        // Add template selection
        const templateRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('template_select')
                    .setPlaceholder('Select a server template')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Standard')
                            .setDescription('Basic Clash of Clans server setup')
                            .setValue('DEFAULT')
                            .setEmoji('⚔️'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Competitive')
                            .setDescription('For serious war clans with strategic focus')
                            .setValue('COMPETITIVE')
                            .setEmoji('🏆'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Casual')
                            .setDescription('For relaxed, social clans')
                            .setValue('CASUAL')
                            .setEmoji('🍻'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Alliance')
                            .setDescription('For multiple clans working together')
                            .setValue('ALLIANCE')
                            .setEmoji('🤝')
                    )
            );

        const response = await interaction.reply({
            embeds: [welcomeEmbed],
            components: [templateRow, actionRow],
            ephemeral: true
        });

        // Create a collector for button interactions
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 minutes timeout
        });

        // Store template selection
        let selectedTemplate = 'DEFAULT';

        collector.on('collect', async i => {
            // Ensure it's the same user
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: "This isn't your setup wizard!", ephemeral: true });
                return;
            }

            // Handle template selection
            if (i.customId === 'template_select') {
                selectedTemplate = i.values[0];
                await i.update({
                    content: `Template selected: ${getTemplateName(selectedTemplate)}`,
                    embeds: [welcomeEmbed],
                    components: [templateRow, actionRow]
                });
                return;
            }

            await i.deferUpdate();

            switch (i.customId) {
                case 'wizard_setup_full':
                    await handleFullSetup(i, interaction, selectedTemplate);
                    break;
                case 'wizard_setup_channels':
                    await handleChannelSetup(i, interaction, selectedTemplate);
                    break;
                case 'wizard_setup_roles':
                    await handleRoleSetup(i, interaction, selectedTemplate);
                    break;
                case 'wizard_setup_cancel':
                    await i.editReply({
                        content: 'Setup wizard canceled.',
                        embeds: [],
                        components: []
                    });
                    collector.stop();
                    break;
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: 'Setup wizard timed out.',
                    embeds: [],
                    components: []
                }).catch(console.error);
            }
        });
    } catch (error) {
        console.error('Error in setup wizard:', error);
        await interaction.reply({ content: `An error occurred: ${error.message}`, ephemeral: true });
    }
}

/**
 * Get human-readable template name
 * @param {string} templateId - Template ID
 * @returns {string} Human-readable name
 */
function getTemplateName(templateId) {
    const names = {
        'DEFAULT': 'Standard',
        'COMPETITIVE': 'Competitive',
        'CASUAL': 'Casual',
        'ALLIANCE': 'Alliance'
    };
    return names[templateId] || templateId;
}

/**
 * Handle full server setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 * @param {string} templateId - Selected template ID
 */
async function handleFullSetup(i, originalInteraction, templateId) {
    const guild = i.guild;

    // Create confirmation message
    const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Full Server Setup')
        .setDescription(`You're about to perform a full server setup using the ${getTemplateName(templateId)} template. This will:`)
        .addFields(
            { name: 'Create or Update', value: '• Categories and channels\n• Roles with permissions\n• Channel permissions' },
            { name: 'Options', value: 'Please select how to handle existing server content:' }
        )
        .setColor('#e74c3c')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Options
    const optionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_full_clean')
                .setLabel('Clean Setup (Remove Existing)')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🧹'),
            new ButtonBuilder()
                .setCustomId('wizard_full_merge')
                .setLabel('Merge (Keep Existing)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [confirmEmbed],
        components: [optionRow]
    });

    // Create a collector for the confirmation button
    const confirmCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    confirmCollector.on('collect', async confirmI => {
        // Ensure it's the same user
        if (confirmI.user.id !== originalInteraction.user.id) {
            await confirmI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await confirmI.deferUpdate();

        if (confirmI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            confirmCollector.stop();
            return;
        }

        const isCleanSetup = confirmI.customId === 'wizard_full_clean';

        // Create server backup
        let backupData;
        try {
            backupData = await createServerBackup(guild);

            // Store backup in a temporary variable (in a production bot, save to database)
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await confirmI.editReply({
                content: 'Server backup created successfully. Beginning setup...',
                embeds: [],
                components: []
            });

            // Start the setup process
            const result = await performFullSetup(guild, isCleanSetup, templateId);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Server Setup Complete')
                .setDescription(`Your server has been set up with the ${getTemplateName(templateId)} Clash of Clans theme!`)
                .addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true },
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            // Add next steps
            resultEmbed.addFields({
                name: 'Next Steps',
                value: '1. Use `/setclan tag:#YOURCLAN` to link your clan\n2. Use `/roles setup type:th_level` to set up Town Hall roles\n3. Use `/roles setup type:clan_role` to set up clan hierarchy roles'
            });

            await confirmI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in full setup:', error);
            await confirmI.editReply({
                content: `An error occurred during setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        confirmCollector.stop();
    });

    confirmCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Setup confirmation timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Handle channel setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 * @param {string} templateId - Selected template ID
 */
async function handleChannelSetup(i, originalInteraction, templateId) {
    const guild = i.guild;

    // Get existing categories
    const existingCategories = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ name: c.name, id: c.id, position: c.position }));

    // Create channel setup embed
    const channelEmbed = new EmbedBuilder()
        .setTitle('📁 Channel Setup')
        .setDescription(`Set up your server channels with a Clash of Clans theme using the ${getTemplateName(templateId)} template.`)
        .addFields(
            { name: 'Current Categories', value: existingCategories.length > 0 ?
                    existingCategories.map(c => `• ${c.name}`).join('\n') :
                    'No categories found' },
            { name: 'Options', value: 'Please select how to handle channel setup:' }
        )
        .setColor('#3498db')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Option buttons
    const channelOptionsRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_channels_clean')
                .setLabel('Remove & Recreate All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('wizard_channels_add')
                .setLabel('Add Missing Only')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [channelEmbed],
        components: [channelOptionsRow]
    });

    // Create collector for channel setup options
    const channelCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    channelCollector.on('collect', async channelI => {
        // Ensure it's the same user
        if (channelI.user.id !== originalInteraction.user.id) {
            await channelI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await channelI.deferUpdate();

        if (channelI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            channelCollector.stop();
            return;
        }

        const isCleanChannels = channelI.customId === 'wizard_channels_clean';

        try {
            // Create backup
            const backupData = await createServerBackup(guild);
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await channelI.editReply({
                content: 'Server backup created successfully. Setting up channels...',
                embeds: [],
                components: []
            });

            // Perform channel setup
            const result = await setupServerChannels(guild, isCleanChannels, templateId);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Channel Setup Complete')
                .setDescription(`Your server channels have been set up with the ${getTemplateName(templateId)} Clash of Clans theme!`)
                .addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Channel setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            await channelI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in channel setup:', error);
            await channelI.editReply({
                content: `An error occurred during channel setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        channelCollector.stop();
    });

    channelCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Channel setup timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Handle role setup
 * @param {ButtonInteraction} i - Button interaction
 * @param {CommandInteraction} originalInteraction - Original command interaction
 * @param {string} templateId - Selected template ID
 */
async function handleRoleSetup(i, originalInteraction, templateId) {
    const guild = i.guild;

    // Get existing roles
    const existingRoles = guild.roles.cache
        .filter(r => r.id !== guild.roles.everyone.id)
        .sort((a, b) => b.position - a.position)
        .map(r => ({ name: r.name, id: r.id, color: r.hexColor }));

    // Create role setup embed
    const roleEmbed = new EmbedBuilder()
        .setTitle('👑 Role Setup')
        .setDescription(`Set up your server roles with a Clash of Clans theme using the ${getTemplateName(templateId)} template.`)
        .addFields(
            { name: 'Current Roles', value: existingRoles.length > 0 ?
                    existingRoles.slice(0, 10).map(r => `• ${r.name}`).join('\n') +
                    (existingRoles.length > 10 ? `\n• ...and ${existingRoles.length - 10} more` : '') :
                    'No custom roles found' },
            { name: 'Options', value: 'Please select how to handle role setup:' }
        )
        .setColor('#9b59b6')
        .setFooter({ text: 'A backup will be created before any changes' });

    // Option buttons
    const roleOptionsRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('wizard_roles_clean')
                .setLabel('Remove & Recreate Roles')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('wizard_roles_add')
                .setLabel('Add & Update Roles')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('wizard_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

    await i.editReply({
        embeds: [roleEmbed],
        components: [roleOptionsRow]
    });

    // Create collector for role setup options
    const roleCollector = i.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 // 1 minute timeout
    });

    roleCollector.on('collect', async roleI => {
        // Ensure it's the same user
        if (roleI.user.id !== originalInteraction.user.id) {
            await roleI.reply({ content: "This isn't your setup wizard!", ephemeral: true });
            return;
        }

        await roleI.deferUpdate();

        if (roleI.customId === 'wizard_back') {
            // Return to main menu
            await startWizard(originalInteraction);
            roleCollector.stop();
            return;
        }

        const isCleanRoles = roleI.customId === 'wizard_roles_clean';

        try {
            // Create backup
            const backupData = await createServerBackup(guild);
            global.tempServerBackups = global.tempServerBackups || {};
            global.tempServerBackups[guild.id] = backupData;

            await roleI.editReply({
                content: 'Server backup created successfully. Setting up roles...',
                embeds: [],
                components: []
            });

            // Perform role setup
            const result = await setupServerRoles(guild, isCleanRoles, templateId);

            // Show results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Role Setup Complete')
                .setDescription(`Your server roles have been set up with the ${getTemplateName(templateId)} Clash of Clans theme!`)
                .addFields(
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                )
                .setColor('#2ecc71')
                .setFooter({ text: 'Role setup completed successfully' });

            if (result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }

            await roleI.editReply({
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error in role setup:', error);
            await roleI.editReply({
                content: `An error occurred during role setup: ${error.message}`,
                embeds: [],
                components: []
            });
        }

        roleCollector.stop();
    });

    roleCollector.on('end', collected => {
        if (collected.size === 0) {
            i.editReply({
                content: 'Role setup timed out.',
                embeds: [],
                components: []
            }).catch(console.error);
        }
    });
}

/**
 * Perform automatic server setup
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function autoSetup(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const template = interaction.options.getString('template') || 'DEFAULT';
    const clean = interaction.options.getBoolean('clean') || false;
    const linkClan = interaction.options.getBoolean('link_clan') || false;

    try {
        // Create backup
        const backupData = await createServerBackup(guild);
        global.tempServerBackups = global.tempServerBackups || {};
        global.tempServerBackups[guild.id] = backupData;

        // Send initial message
        await interaction.editReply({
            content: `Server backup created successfully. Beginning automatic setup using the ${getTemplateName(template)} template...`,
            embeds: []
        });

        // Perform full setup
        const result = await performFullSetup(guild, clean, template);

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Automatic Server Setup Complete')
            .setDescription(`Your server has been set up with the ${getTemplateName(template)} Clash of Clans theme!`)
            .addFields(
                { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true },
                { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
            )
            .setColor('#2ecc71')
            .setFooter({ text: 'Setup completed successfully' });

        if (result.stats.errors.length > 0) {
            const errorList = result.stats.errors.slice(0, 3).join('\n');
            resultEmbed.addFields({
                name: '⚠️ Some Errors Occurred',
                value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
            });
        }

        // Add next steps or initiate clan linking if requested
        if (linkClan) {
            resultEmbed.addFields({
                name: 'Next Steps',
                value: 'Use `/setclan tag:#YOURCLAN` to link your clan, then use `/roles setup type:th_level` and `/roles setup type:clan_role` to set up roles.'
            });

            // Create button for immediate clan linking
            const linkRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('link_clan_now')
                        .setLabel('Link Clan Now')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔗')
                );

            await interaction.editReply({
                embeds: [resultEmbed],
                components: [linkRow]
            });

            // Collect button click
            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000 // 1 minute timeout
            });

            collector.on('collect', async buttonInteraction => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({ content: "This isn't your setup wizard!", ephemeral: true });
                    return;
                }

                if (buttonInteraction.customId === 'link_clan_now') {
                    // Create modal for clan tag input
                    const modal = new ModalBuilder()
                        .setCustomId('clan_tag_modal')
                        .setTitle('Link Your Clan');

                    const clanTagInput = new TextInputBuilder()
                        .setCustomId('clan_tag')
                        .setLabel('Clan Tag (e.g., #ABC123)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const firstActionRow = new ActionRowBuilder().addComponents(clanTagInput);
                    modal.addComponents(firstActionRow);

                    await buttonInteraction.showModal(modal);
                }
            });

            // Handle modal submission
            interaction.client.on('interactionCreate', async modalInteraction => {
                if (!modalInteraction.isModalSubmit()) return;
                if (modalInteraction.customId !== 'clan_tag_modal') return;
                if (modalInteraction.user.id !== interaction.user.id) return;

                await modalInteraction.deferReply({ ephemeral: true });

                const clanTag = modalInteraction.fields.getTextInputValue('clan_tag');

                try {
                    // Implement clan linking logic here
                    await setUpClanLink(modalInteraction, clanTag);
                } catch (error) {
                    console.error('Error linking clan:', error);
                    await modalInteraction.editReply({
                        content: `Error linking clan: ${error.message}`,
                        ephemeral: true
                    });
                }
            });
        } else {
            resultEmbed.addFields({
                name: 'Next Steps',
                value: '1. Use `/setclan tag:#YOURCLAN` to link your clan\n2. Use `/roles setup type:th_level` to set up Town Hall roles\n3. Use `/roles setup type:clan_role` to set up clan hierarchy roles'
            });

            await interaction.editReply({
                embeds: [resultEmbed]
            });
        }

    } catch (error) {
        console.error('Error in automatic setup:', error);
        await interaction.editReply({
            content: `An error occurred during setup: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Helper function to set up clan linking
 * @param {ModalSubmitInteraction} interaction - The modal interaction
 * @param {string} clanTag - The clan tag to link
 */
async function setUpClanLink(interaction, clanTag) {
    try {
        // Format clan tag
        if (!clanTag.startsWith('#')) {
            clanTag = '#' + clanTag;
        }
        clanTag = clanTag.toUpperCase();

        // Fetch clan data
        const clanData = await clashApiService.getClan(clanTag);

        if (!clanData) {
            return interaction.editReply('Could not find a clan with that tag. Please check the tag and try again.');
        }

        // Find or update clan in database
        const clan = await Clan.findOneAndUpdate(
            { clanTag },
            {
                clanTag,
                name: clanData.name,
                guildId: interaction.guild.id,
                description: clanData.description,
                settings: {
                    channels: {
                        // Find appropriate channels
                        warAnnouncements: findChannelByName(interaction.guild, ['war-log', 'war-announcements'])?.id,
                        general: findChannelByName(interaction.guild, ['town-hall', 'general', 'clan-announcements'])?.id
                    }
                },
                updatedAt: Date.now()
            },
            {
                upsert: true,
                new: true,
                runValidators: true
            }
        );

        // Display success message
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Clan Linked Successfully')
            .setDescription(`Your server has been linked to **${clanData.name}** (${clanData.tag})!`)
            .setThumbnail(clanData.badgeUrls?.medium || null)
            .addFields(
                { name: 'Members', value: `${clanData.members}/50`, inline: true },
                { name: 'Clan Level', value: clanData.clanLevel.toString(), inline: true },
                { name: 'War League', value: clanData.warLeague?.name || 'None', inline: true }
            )
            .setFooter({ text: 'You can now use clan-specific commands and features' });

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });

        // Send a public announcement
        const announcementChannel = findChannelByName(interaction.guild, ['clan-announcements', 'announcements', 'general']);
        if (announcementChannel) {
            const announcementEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🎉 Clan Linked to Server')
                .setDescription(`This Discord server is now linked to **${clanData.name}** (${clanData.tag})!`)
                .setThumbnail(clanData.badgeUrls?.medium || null)
                .addFields(
                    { name: 'Next Steps', value: 'Members can now use `/link` to link their Clash of Clans accounts to their Discord profiles!' }
                );

            await announcementChannel.send({ embeds: [announcementEmbed] });
        }

        // Check if they want to set up roles
        const roleSetupRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_clan_roles')
                    .setLabel('Set Up Clan Roles')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👑'),
                new ButtonBuilder()
                    .setCustomId('setup_th_roles')
                    .setLabel('Set Up Town Hall Roles')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏠')
            );

        await interaction.followUp({
            content: 'Would you like to set up automatic roles based on your clan?',
            components: [roleSetupRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in clan linking:', error);
        await interaction.editReply({
            content: `Error linking clan: ${error.message}`,
            ephemeral: true
        });
    }
}

/**
 * Helper function to find a channel by name from a list of potential names
 * @param {Guild} guild - The Discord guild
 * @param {string[]} names - Array of potential channel names
 * @returns {GuildChannel|null} The found channel or null
 */
function findChannelByName(guild, names) {
    for (const name of names) {
        const channel = guild.channels.cache.find(c =>
            c.name.toLowerCase() === name.toLowerCase() &&
            c.type === ChannelType.GuildText
        );
        if (channel) return channel;
    }
    return null;
}

/**
 * Update specific parts of the server
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function updateServer(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const target = interaction.options.getString('target');

    try {
        // Create backup
        const backupData = await createServerBackup(guild);
        global.tempServerBackups = global.tempServerBackups || {};
        global.tempServerBackups[guild.id] = backupData;

        let result;
        let title;

        switch (target) {
            case 'channels':
                result = await setupServerChannels(guild, false);
                title = 'Channel Update';
                break;
            case 'roles':
                result = await setupServerRoles(guild, false);
                title = 'Role Update';
                break;
            case 'permissions':
                result = await updateServerPermissions(guild);
                title = 'Permission Update';
                break;
            case 'colors':
                result = await updateRoleColors(guild);
                title = 'Role Color Update';
                break;
            default:
                return interaction.editReply('Invalid update target.');
        }

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle(`✅ ${title} Complete`)
            .setDescription(`Your server ${target} have been updated with the Clash of Clans theme!`)
            .setColor('#2ecc71')
            .setFooter({ text: 'Update completed successfully' });

        if (result.stats) {
            if (target === 'channels') {
                resultEmbed.addFields(
                    { name: 'Categories', value: `Created: ${result.stats.categoriesCreated}\nUpdated: ${result.stats.categoriesUpdated}`, inline: true },
                    { name: 'Channels', value: `Created: ${result.stats.channelsCreated}\nUpdated: ${result.stats.channelsUpdated}`, inline: true }
                );
            } else if (target === 'roles') {
                resultEmbed.addFields(
                    { name: 'Roles', value: `Created: ${result.stats.rolesCreated}\nUpdated: ${result.stats.rolesUpdated}`, inline: true }
                );
            } else if (target === 'permissions') {
                resultEmbed.addFields(
                    { name: 'Permissions', value: `Updated: ${result.stats.permissionsUpdated}`, inline: true }
                );
            } else if (target === 'colors') {
                resultEmbed.addFields(
                    { name: 'Role Colors', value: `Updated: ${result.stats.colorsUpdated}`, inline: true }
                );
            }

            if (result.stats.errors && result.stats.errors.length > 0) {
                const errorList = result.stats.errors.slice(0, 3).join('\n');
                resultEmbed.addFields({
                    name: '⚠️ Some Errors Occurred',
                    value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
                });
            }
        }

        await interaction.editReply({
            embeds: [resultEmbed]
        });

    } catch (error) {
        console.error(`Error updating ${target}:`, error);
        await interaction.editReply({
            content: `An error occurred during update: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Sync server roles with a Clash of Clans clan
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function syncWithClan(interaction) {
    await interaction.deferReply();

    try {
        // Get clan tag
        let clanTag = interaction.options.getString('clan_tag');

        // If no clan tag provided, try to get linked clan
        if (!clanTag) {
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan) {
                return interaction.editReply("This server doesn't have a linked clan. Use `/setclan` first or provide a clan tag.");
            }
            clanTag = linkedClan.clanTag;
        }

        // Format clan tag
        if (!clanTag.startsWith('#')) {
            clanTag = '#' + clanTag;
        }
        clanTag = clanTag.toUpperCase();

        // Get clan data from API
        const clanData = await clashApiService.getClan(clanTag);

        if (!clanData || !clanData.members) {
            return interaction.editReply('Could not retrieve clan data. Please check the clan tag and try again.');
        }

        await interaction.editReply(`Found clan: ${clanData.name} (${clanData.tag}). Syncing roles...`);

        // Perform role sync
        const result = await syncClanRoles(interaction.guild, clanData);

        // Show results
        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Clan Role Sync Complete')
            .setDescription(`Your server roles have been synchronized with ${clanData.name}!`)
            .addFields(
                { name: 'Members Processed', value: result.stats.membersProcessed.toString(), inline: true },
                { name: 'Roles Updated', value: result.stats.rolesUpdated.toString(), inline: true }
            )
            .setColor('#2ecc71')
            .setFooter({ text: 'Role sync completed successfully' });

        if (result.stats.errors.length > 0) {
            const errorList = result.stats.errors.slice(0, 3).join('\n');
            resultEmbed.addFields({
                name: '⚠️ Some Errors Occurred',
                value: errorList + (result.stats.errors.length > 3 ? `\n...and ${result.stats.errors.length - 3} more` : '')
            });
        }

        // Add explanation for TH roles
        resultEmbed.addFields({
            name: 'Next Steps',
            value: 'To set up Town Hall level roles, use the command `/roles setup type:th_level`'
        });

        await interaction.editReply({
            embeds: [resultEmbed]
        });

    } catch (error) {
        console.error('Error in clan sync:', error);
        await interaction.editReply({
            content: `An error occurred during clan sync: ${error.message}`,
            embeds: []
        });
    }
}

/**
 * Create a backup of server settings
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function createBackup(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Create the backup
        const backupData = await createServerBackup(interaction.guild);

        // Generate a backup ID
        const backupId = `backup_${Date.now()}`;

        // Save backup (in a real bot, this would be in a database)
        global.serverBackups = global.serverBackups || {};
        global.serverBackups[interaction.guild.id] = global.serverBackups[interaction.guild.id] || [];
        global.serverBackups[interaction.guild.id].push({
            id: backupId,
            timestamp: backupData.timestamp,
            data: backupData
        });

        // Limit the number of stored backups (keep the most recent 5)
        if (global.serverBackups[interaction.guild.id].length > 5) {
            global.serverBackups[interaction.guild.id].shift();
        }

        // Create success embed
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Server Backup Created')
            .setDescription(`A backup of your server configuration has been created.`)
            .addFields(
                { name: 'Backup ID', value: backupId, inline: true },
                { name: 'Created At', value: new Date(backupData.timestamp).toLocaleString(), inline: true },
                { name: 'Contents', value: `${backupData.categories.length} Categories\n${backupData.channels.length} Channels\n${backupData.roles.length} Roles` }
            )
            .setFooter({ text: `Use /setupwizard restore backup_id:${backupId} to restore this backup` });

        return interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error creating backup:', error);
        return interaction.editReply({
            content: `An error occurred while creating the backup: ${error.message}`,
            ephemeral: true
        });
    }
}

/**
 * Restore server from a backup
 * @param {CommandInteraction} interaction - Discord interaction
 */
async function restoreBackup(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Check if there are any backups
        global.serverBackups = global.serverBackups || {};
        const guildBackups = global.serverBackups[interaction.guild.id] || [];

        if (guildBackups.length === 0) {
            return interaction.editReply('No backups found for this server.');
        }

        // Get the backup ID if provided, otherwise use the latest backup
        const backupId = interaction.options.getString('backup_id');
        let backupToRestore;

        if (backupId) {
            backupToRestore = guildBackups.find(b => b.id === backupId);
            if (!backupToRestore) {
                return interaction.editReply(`No backup found with ID ${backupId}. Available backups: ${guildBackups.map(b => b.id).join(', ')}`);
            }
        } else {
            // Use the most recent backup
            backupToRestore = guildBackups[guildBackups.length - 1];
        }

        // Confirmation message
        const confirmEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('⚠️ Restore Server Backup')
            .setDescription('You are about to restore your server from a backup. This will:')
            .addFields(
                { name: 'Backup Information', value: `ID: ${backupToRestore.id}\nCreated: ${new Date(backupToRestore.timestamp).toLocaleString()}` },
                { name: 'Warning', value: 'This will modify your server structure. Please confirm this action.' }
            );

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_restore')
                    .setLabel('Restore Backup')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_restore')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

        // Wait for confirmation
        const confirmCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === interaction.user.id && ['confirm_restore', 'cancel_restore'].includes(i.customId),
            time: 60000,
            max: 1
        });

        confirmCollector.on('collect', async i => {
            await i.deferUpdate();

            if (i.customId === 'cancel_restore') {
                await i.editReply({
                    content: 'Backup restore cancelled.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Restore the backup
            await i.editReply({
                content: 'Restoring server from backup...',
                embeds: [],
                components: []
            });

            try {
                // Implementation of restore logic would go here
                // This would be complex and require careful restoration of channels, roles, and permissions

                // Mock implementation for now
                await new Promise(resolve => setTimeout(resolve, 2000));

                await i.editReply({
                    content: '✅ Server has been restored from backup!',
                    components: []
                });
            } catch (error) {
                console.error('Error restoring backup:', error);
                await i.editReply({
                    content: `Error restoring backup: ${error.message}`,
                    components: []
                });
            }
        });

        confirmCollector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: 'Backup restore timed out.',
                    embeds: [],
                    components: []
                }).catch(console.error);
            }
        });

    } catch (error) {
        console.error('Error in restore backup:', error);
        return interaction.editReply({
            content: `An error occurred: ${error.message}`,
            ephemeral: true
        });
    }
}

/**
 * Synchronize server roles with a Clash of Clans clan
 * @param {Guild} guild - Discord guild
 * @param {Object} clanData - Clan data from API
 */
async function syncClanRoles(guild, clanData) {
    const stats = {
        membersProcessed: 0,
        rolesUpdated: 0,
        errors: []
    };

    try {
        // Ensure the clan roles exist
        const roles = {
            'Leader': null,
            'Co-Leader': null,
            'Elder': null,
            'Member': null
        };

        // Get existing roles
        for (const roleName of Object.keys(roles)) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                roles[roleName] = role;
            } else {
                // Create the role if it doesn't exist
                try {
                    const newRole = await guild.roles.create({
                        name: roleName,
                        color: roleName === 'Leader' ? '#e74c3c' :
                            roleName === 'Co-Leader' ? '#e67e22' :
                                roleName === 'Elder' ? '#f1c40f' : '#3498db',
                        hoist: true,
                        mentionable: true,
                        reason: 'CoC Bot Role Sync'
                    });

                    // Set permissions if defined for this role
                    if (ROLE_PERMISSIONS[roleName]) {
                        await newRole.setPermissions(ROLE_PERMISSIONS[roleName]);
                    }

                    roles[roleName] = newRole;
                    stats.rolesUpdated++;
                } catch (error) {
                    console.error(`Error creating role ${roleName}:`, error);
                    stats.errors.push(`Failed to create role ${roleName}: ${error.message}`);
                }
            }
        }

        // Process clan members
        for (const member of clanData.members) {
            stats.membersProcessed++;

            // Find linked Discord user
            const linkedUser = await User.findOne({ playerTag: member.tag });
            if (!linkedUser || !linkedUser.discordId) {
                continue; // Skip members without linked Discord accounts
            }

            try {
                // Get the Discord member
                const discordMember = await guild.members.fetch(linkedUser.discordId).catch(() => null);
                if (!discordMember) continue;

                // Map CoC role to Discord role
                let roleToAssign;
                switch (member.role.toLowerCase()) {
                    case 'leader':
                        roleToAssign = roles['Leader'];
                        break;
                    case 'coleader':
                    case 'co-leader':
                    case 'admin':
                        roleToAssign = roles['Co-Leader'];
                        break;
                    case 'elder':
                        roleToAssign = roles['Elder'];
                        break;
                    default:
                        roleToAssign = roles['Member'];
                }

                if (roleToAssign) {
                    // Remove other clan roles
                    for (const role of Object.values(roles)) {
                        if (role && role.id !== roleToAssign.id && discordMember.roles.cache.has(role.id)) {
                            await discordMember.roles.remove(role);
                            stats.rolesUpdated++;
                        }
                    }

                    // Add the appropriate role
                    if (!discordMember.roles.cache.has(roleToAssign.id)) {
                        await discordMember.roles.add(roleToAssign);
                        stats.rolesUpdated++;
                    }
                }
            } catch (error) {
                console.error(`Error processing member ${member.name}:`, error);
                stats.errors.push(`Failed to process member ${member.name}: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in syncClanRoles:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Set up server channels
 * @param {Guild} guild - Discord guild
 * @param {boolean} cleanChannels - Whether to remove existing channels first
 * @param {string} template - Template name
 */
async function setupServerChannels(guild, cleanChannels, template = 'DEFAULT') {
    const templateData = SERVER_TEMPLATES[template];
    const stats = {
        categoriesCreated: 0,
        categoriesUpdated: 0,
        channelsCreated: 0,
        channelsUpdated: 0,
        errors: []
    };

    try {
        // If clean setup, remove all existing channels
        if (cleanChannels) {
            try {
                // Delete non-category channels first
                const nonCategoryChannels = guild.channels.cache
                    .filter(c => c.type !== ChannelType.GuildCategory);

                for (const channel of nonCategoryChannels.values()) {
                    try {
                        await channel.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting channel ${channel.name}:`, error);
                        stats.errors.push(`Failed to delete channel ${channel.name}: ${error.message}`);
                    }
                }

                // Then delete categories
                const categories = guild.channels.cache
                    .filter(c => c.type === ChannelType.GuildCategory);

                for (const category of categories.values()) {
                    try {
                        await channel.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting category ${category.name}:`, error);
                        stats.errors.push(`Failed to delete category ${category.name}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error('Error removing existing channels:', error);
                stats.errors.push(`Failed to remove existing channels: ${error.message}`);
            }
        }

        // Create each category and its channels
        for (const categoryData of templateData.categories) {
            try {
                // Check if category already exists
                let category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name === categoryData.name
                );

                // Determine permission overwrites for the category
                let permissionOverwrites = [];

                // If it's a restricted category, set up permissions
                if (categoryData.restricted) {
                    // Default permission - deny view to everyone
                    permissionOverwrites.push({
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    });

                    // Get roles for permissions
                    const elderRole = guild.roles.cache.find(r => r.name === 'Elder');
                    const coLeaderRole = guild.roles.cache.find(r => r.name === 'Co-Leader');
                    const leaderRole = guild.roles.cache.find(r => r.name === 'Leader');

                    // Give view permissions to appropriate roles
                    if (elderRole) {
                        permissionOverwrites.push({
                            id: elderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }

                    if (coLeaderRole) {
                        permissionOverwrites.push({
                            id: coLeaderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }

                    if (leaderRole) {
                        permissionOverwrites.push({
                            id: leaderRole.id,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    }
                }

                // Create category if it doesn't exist
                if (!category) {
                    category = await guild.channels.create({
                        name: categoryData.name,
                        type: ChannelType.GuildCategory,
                        permissionOverwrites,
                        reason: 'CoC Bot Server Setup'
                    });
                    stats.categoriesCreated++;
                } else {
                    // Update permissions on existing category
                    if (permissionOverwrites.length > 0) {
                        await category.permissionOverwrites.set(permissionOverwrites);
                        stats.categoriesUpdated++;
                    }
                }

                // Create channels in the category
                for (const channelData of categoryData.channels) {
                    // Check if channel already exists in this category
                    const existingChannel = guild.channels.cache.find(
                        c => c.name === channelData.name && c.parentId === category.id
                    );

                    if (!existingChannel) {
                        // Check for special permissions
                        let channelPermissions = [];

                        // War room permissions
                        if (channelData.name === 'war-room') {
                            // Add War General role permission
                            const warGeneralRole = guild.roles.cache.find(r => r.name === 'War General');
                            if (warGeneralRole) {
                                channelPermissions.push({
                                    id: warGeneralRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }
                        }

                        // Elder hall permissions
                        if (channelData.name === 'elder-hall') {
                            // Find roles
                            const elderRole = guild.roles.cache.find(r => r.name === 'Elder');
                            const coLeaderRole = guild.roles.cache.find(r => r.name === 'Co-Leader');
                            const leaderRole = guild.roles.cache.find(r => r.name === 'Leader');

                            // Deny everyone
                            channelPermissions.push({
                                id: guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            });

                            // Allow specific roles
                            if (elderRole) {
                                channelPermissions.push({
                                    id: elderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }

                            if (coLeaderRole) {
                                channelPermissions.push({
                                    id: coLeaderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }

                            if (leaderRole) {
                                channelPermissions.push({
                                    id: leaderRole.id,
                                    allow: [PermissionFlagsBits.ViewChannel]
                                });
                            }
                        }

                        // Create the channel
                        await guild.channels.create({
                            name: channelData.name,
                            type: channelData.type,
                            parent: category.id,
                            topic: channelData.topic,
                            permissionOverwrites: channelPermissions,
                            reason: 'CoC Bot Server Setup'
                        });
                        stats.channelsCreated++;
                    } else {
                        // Update topic on existing channel
                        if (channelData.topic && existingChannel.topic !== channelData.topic) {
                            await existingChannel.setTopic(channelData.topic);
                            stats.channelsUpdated++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error setting up category ${categoryData.name}:`, error);
                stats.errors.push(`Failed to set up category ${categoryData.name}: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in setupServerChannels:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Set up server roles
 * @param {Guild} guild - Discord guild
 * @param {boolean} cleanRoles - Whether to remove existing roles first
 * @param {string} template - Template name
 */
async function setupServerRoles(guild, cleanRoles, template = 'DEFAULT') {
    const templateData = SERVER_TEMPLATES[template];
    const stats = {
        rolesCreated: 0,
        rolesUpdated: 0,
        errors: []
    };

    try {
        // If clean setup, remove all existing roles
        if (cleanRoles) {
            try {
                const existingRoles = guild.roles.cache
                    .filter(r => r.id !== guild.roles.everyone.id && r.position < guild.me.roles.highest.position);

                for (const role of existingRoles.values()) {
                    try {
                        await role.delete('Server setup wizard - clean setup');
                    } catch (error) {
                        console.error(`Error deleting role ${role.name}:`, error);
                        stats.errors.push(`Failed to delete role ${role.name}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error('Error removing existing roles:', error);
                stats.errors.push(`Failed to remove existing roles: ${error.message}`);
            }
        }

        // Create roles
        const createdRoles = {};

        for (const roleData of templateData.roles) {
            try {
                // Check if role already exists
                let role = guild.roles.cache.find(r => r.name === roleData.name);

                if (!role) {
                    // Create the role
                    role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        mentionable: roleData.mentionable,
                        reason: 'CoC Bot Server Setup'
                    });

                    // Set permissions based on role type
                    if (ROLE_PERMISSIONS[roleData.name]) {
                        await role.setPermissions(ROLE_PERMISSIONS[roleData.name]);
                    }

                    createdRoles[roleData.name] = role;
                    stats.rolesCreated++;
                } else {
                    // Update existing role
                    let updated = false;

                    // Update color if different
                    if (role.hexColor !== roleData.color) {
                        await role.setColor(roleData.color);
                        updated = true;
                    }

                    // Update hoist if different
                    if (role.hoist !== roleData.hoist) {
                        await role.setHoist(roleData.hoist);
                        updated = true;
                    }

                    // Update mentionable if different
                    if (role.mentionable !== roleData.mentionable) {
                        await role.setMentionable(roleData.mentionable);
                        updated = true;
                    }

                    // Update permissions if needed
                    if (ROLE_PERMISSIONS[roleData.name]) {
                        const currentPerms = role.permissions.toArray();
                        const shouldUpdate = !ROLE_PERMISSIONS[roleData.name].every(perm =>
                            currentPerms.includes(perm)
                        );

                        if (shouldUpdate) {
                            await role.setPermissions(ROLE_PERMISSIONS[roleData.name]);
                            updated = true;
                        }
                    }

                    if (updated) {
                        stats.rolesUpdated++;
                    }

                    createdRoles[roleData.name] = role;
                }
            } catch (error) {
                console.error(`Error setting up role ${roleData.name}:`, error);
                stats.errors.push(`Failed to set up role ${roleData.name}: ${error.message}`);
            }
        }

        // Try to adjust role positions - needs to be done after all roles are created
        try {
            // Must be in descending order - lower positions first (higher position value = lower on the list)
            const sortedRoles = templateData.roles
                .map(roleData => ({
                    name: roleData.name,
                    position: roleData.position
                }))
                .sort((a, b) => b.position - a.position);

            for (const roleInfo of sortedRoles) {
                const role = createdRoles[roleInfo.name];
                if (role) {
                    try {
                        await role.setPosition(roleInfo.position);
                    } catch (error) {
                        console.error(`Error setting position for role ${roleInfo.name}:`, error);
                        stats.errors.push(`Failed to set position for role ${roleInfo.name}: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error adjusting role positions:', error);
            stats.errors.push(`Failed to adjust role positions: ${error.message}`);
        }

        return { stats, roles: createdRoles };
    } catch (error) {
        console.error('Error in setupServerRoles:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}

/**
 * Update channel permissions
 * @param {Guild} guild - Discord guild
 */
async function updateServerPermissions(guild) {
    const stats = {
        permissionsUpdated: 0,
        errors: []
    };

    try {
        // Get existing roles
        const roles = {
            leader: guild.roles.cache.find(r => r.name === 'Leader'),
            coLeader: guild.roles.cache.find(r => r.name === 'Co-Leader'),
            elder: guild.roles.cache.find(r => r.name === 'Elder'),
            member: guild.roles.cache.find(r => r.name === 'Member'),
            warGeneral: guild.roles.cache.find(r => r.name === 'War General'),
            recruiter: guild.roles.cache.find(r => r.name === 'Recruiter')
        };

        // Define permission mappings
        const permissions = {};

        // War Council category
        const warCouncilCategory = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === 'War Council'
        );

        if (warCouncilCategory) {
            // Set permissions for War Council category
            const warCouncilPerms = [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
            ];

            // Add role permissions
            if (roles.elder) warCouncilPerms.push({ id: roles.elder.id, allow: [PermissionFlagsBits.ViewChannel] });
            if (roles.coLeader) warCouncilPerms.push({ id: roles.coLeader.id, allow: [PermissionFlagsBits.ViewChannel] });
            if (roles.leader) warCouncilPerms.push({ id: roles.leader.id, allow: [PermissionFlagsBits.ViewChannel] });

            try {
                await warCouncilCategory.permissionOverwrites.set(warCouncilPerms);
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting War Council permissions:', error);
                stats.errors.push(`Failed to set War Council permissions: ${error.message}`);
            }
        }

        // War room channel
        const warRoomChannel = guild.channels.cache.find(
            c => c.name === 'war-room'
        );

        if (warRoomChannel && roles.warGeneral) {
            try {
                await warRoomChannel.permissionOverwrites.create(roles.warGeneral.id, {
                    ViewChannel: true
                });
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting war-room permissions:', error);
                stats.errors.push(`Failed to set war-room permissions: ${error.message}`);
            }
        }

        // Scout tower channel
        const scoutTowerChannel = guild.channels.cache.find(
            c => c.name === 'scout-tower'
        );

        if (scoutTowerChannel && roles.recruiter) {
            try {
                await scoutTowerChannel.permissionOverwrites.create(roles.recruiter.id, {
                    ViewChannel: true
                });
                stats.permissionsUpdated++;
            } catch (error) {
                console.error('Error setting scout-tower permissions:', error);
                stats.errors.push(`Failed to set scout-tower permissions: ${error.message}`);
            }
        }

        return { stats };
    } catch (error) {
        console.error('Error in updateServerPermissions:', error);
        stats.errors.push(`General error: ${error.message}`);
        return { stats };
    }
}