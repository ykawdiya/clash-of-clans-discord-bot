// src/services/setupWizardService.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const serverSetup = require('../utils/serverSetup');
const roleSetup = require('../utils/roleSetup');
const permissionSetup = require('../utils/permissionSetup');
const configManager = require('../utils/configManager');
const clashApiService = require('./clashApiService');
const Clan = require('../models/Clan');

class SetupWizardService {
    constructor() {
        // Store active setup sessions
        this.activeSessions = new Map();

        // Wizard states
        this.STATES = {
            WELCOME: 'welcome',
            CLAN_SELECTION: 'clan_selection',
            SERVER_STRUCTURE: 'server_structure',
            ROLE_SETUP: 'role_setup',
            PERMISSIONS: 'permissions',
            FEATURES: 'features',
            CONFIRMATION: 'confirmation',
            COMPLETE: 'complete'
        };
    }

    /**
     * Start the setup wizard
     * @param {Interaction} interaction
     */
    async startWizard(interaction) {
        // Create a new session for this guild
        const session = {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            startTime: Date.now(),
            currentState: this.STATES.WELCOME,
            selections: {},
            completedSteps: [],
            channelsCreated: [],
            rolesCreated: []
        };

        this.activeSessions.set(interaction.guild.id, session);

        // Show welcome message
        await this.showWelcomeScreen(interaction);
    }

    /**
     * Show welcome screen and initial options
     * @param {Interaction} interaction
     */
    async showWelcomeScreen(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🏗️ Discord Server Setup Wizard')
            .setDescription('Welcome to the Clash of Clans Discord Server Setup Wizard! This wizard will guide you through setting up your server with all the categories, channels, and roles needed for a well-organized clan.')
            .setColor('#f1c40f')
            .addFields(
                { name: '📝 What will be set up?', value: '• Server categories and channels\n• Roles based on clan positions\n• Permissions for channels and roles\n• Integrations with your Clash of Clans clan' },
                { name: '⚠️ Important Notes', value: '• You should have administrator permissions\n• Some steps will modify your server structure\n• You can cancel anytime during the process' }
            )
            .setFooter({ text: 'This process will take about 5 minutes to complete' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_start')
                    .setLabel('Start Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚀'),
                new ButtonBuilder()
                    .setCustomId('setup_template')
                    .setLabel('Use Template')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('setup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    /**
     * Continue to clan selection step
     * @param {Interaction} interaction
     */
    async showClanSelection(interaction) {
        await interaction.deferUpdate();

        // Get the session
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.CLAN_SELECTION;

        // Check if a clan is already linked to this server
        const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

        const embed = new EmbedBuilder()
            .setTitle('Step 1: Clan Selection')
            .setColor('#3498db');

        let components = [];

        if (linkedClan) {
            embed.setDescription(`Your server is currently linked to the clan: **${linkedClan.name}** (${linkedClan.clanTag})\n\nWould you like to use this clan for the setup?`);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_use_linked_clan')
                        .setLabel('Use Linked Clan')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('setup_link_different')
                        .setLabel('Link Different Clan')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('setup_skip_clan')
                        .setLabel('Skip Clan Link')
                        .setStyle(ButtonStyle.Secondary)
                );

            components.push(row);
        } else {
            embed.setDescription(`No clan is currently linked to this server. You can either link a clan now or skip this step.\n\nLinking a clan will allow the wizard to automatically set up roles based on your clan's structure.`);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_link_clan')
                        .setLabel('Link a Clan')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('setup_skip_clan')
                        .setLabel('Skip Clan Link')
                        .setStyle(ButtonStyle.Secondary)
                );

            components.push(row);
        }

        // Add navigation buttons
        const navRow = this.createNavigationRow(session, false, true);
        components.push(navRow);

        await interaction.editReply({ embeds: [embed], components: components });
    }

    /**
     * Show server structure selection
     * @param {Interaction} interaction
     */
    async showServerStructure(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.SERVER_STRUCTURE;

        await interaction.deferUpdate();

        const serverTemplates = [
            { value: 'standard', name: 'Standard Clan', description: 'Basic structure with general, announcement, and war channels' },
            { value: 'competitive', name: 'Competitive', description: 'Focus on war strategy, CWL, and tournament organization' },
            { value: 'community', name: 'Community-focused', description: 'More social channels and discussion areas' },
            { value: 'family', name: 'Clan Family', description: 'For clans with multiple sub-clans or feeder clans' },
            { value: 'custom', name: 'Custom', description: 'Create a custom structure' }
        ];

        const embed = new EmbedBuilder()
            .setTitle('Step 2: Server Structure')
            .setDescription('Choose a template for your server\'s categories and channels:')
            .setColor('#3498db');

        // Add description of each template
        serverTemplates.forEach(template => {
            embed.addFields({ name: template.name, value: template.description });
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_server_template')
            .setPlaceholder('Select a server template')
            .addOptions(serverTemplates.map(template => ({
                label: template.name,
                value: template.value,
                description: template.description
            })));

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        // Add navigation buttons
        const navRow = this.createNavigationRow(session);

        await interaction.editReply({ embeds: [embed], components: [actionRow, navRow] });
    }

    /**
     * Show role setup options
     * @param {Interaction} interaction
     */
    async showRoleSetup(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.ROLE_SETUP;

        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('Step 3: Role Setup')
            .setDescription('Select the types of roles you want to create for your server:')
            .setColor('#3498db');

        const options = [
            { value: 'clan_roles', name: 'Clan Roles', description: 'Leader, Co-Leader, Elder, Member roles from Clash of Clans', defaultChecked: true },
            { value: 'th_roles', name: 'Town Hall Roles', description: 'Roles for each Town Hall level (TH7-TH15)', defaultChecked: true },
            { value: 'war_roles', name: 'War Roles', description: 'Roles for war participants, CWL, and war planning', defaultChecked: false },
            { value: 'special_roles', name: 'Special Roles', description: 'Bot Admin, Event Manager, and other utility roles', defaultChecked: false }
        ];

        // Add role type descriptions
        options.forEach(option => {
            embed.addFields({ name: option.name, value: option.description });
        });

        // Create checkboxes (using buttons, as Discord doesn't have actual checkboxes)
        const rows = options.map(option => {
            // Store default selections in session
            if (option.defaultChecked && !session.selections.hasOwnProperty('roles')) {
                session.selections.roles = session.selections.roles || [];
                session.selections.roles.push(option.value);
            }

            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_role_toggle_${option.value}`)
                    .setLabel(option.name)
                    .setStyle(session.selections.roles?.includes(option.value) ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setEmoji(session.selections.roles?.includes(option.value) ? '✅' : '⬜')
            );
        });

        // Add navigation buttons
        const navRow = this.createNavigationRow(session);
        rows.push(navRow);

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    /**
     * Show permissions setup
     * @param {Interaction} interaction
     */
    async showPermissionsSetup(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.PERMISSIONS;

        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('Step 4: Permission Setup')
            .setDescription('Choose how you want to set up channel and role permissions:')
            .setColor('#3498db')
            .addFields(
                { name: 'Standard Permissions', value: 'Recommended permissions based on role hierarchy' },
                { name: 'Strict Permissions', value: 'More restricted permissions with limited access for lower roles' },
                { name: 'Open Permissions', value: 'More open permissions with greater access for all members' },
                { name: 'Custom Permissions', value: 'Set up permissions manually after the wizard' }
            );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_permissions_template')
            .setPlaceholder('Select a permission template')
            .addOptions([
                { label: 'Standard Permissions', value: 'standard', description: 'Balanced permissions for most clans' },
                { label: 'Strict Permissions', value: 'strict', description: 'More controlled environment' },
                { label: 'Open Permissions', value: 'open', description: 'More community-driven approach' },
                { label: 'Custom Permissions', value: 'custom', description: 'Set up manually later' }
            ]);

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        // Add navigation buttons
        const navRow = this.createNavigationRow(session);

        await interaction.editReply({ embeds: [embed], components: [actionRow, navRow] });
    }

    /**
     * Show feature selection
     * @param {Interaction} interaction
     */
    async showFeatureSelection(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.FEATURES;

        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('Step 5: Feature Selection')
            .setDescription('Select which features you want to enable for your server:')
            .setColor('#3498db');

        const options = [
            { value: 'war_announcements', name: 'War Announcements', description: 'Automatic war start/end notifications', defaultChecked: true },
            { value: 'member_tracking', name: 'Member Tracking', description: 'Track donations, activity, and war performance', defaultChecked: true },
            { value: 'auto_roles', name: 'Auto Roles', description: 'Automatically assign roles based on clan position', defaultChecked: true },
            { value: 'welcome_messages', name: 'Welcome Messages', description: 'Automatic welcome messages for new members', defaultChecked: true },
            { value: 'base_sharing', name: 'Base Sharing', description: 'Enable base sharing and management system', defaultChecked: false }
        ];

        // Add feature descriptions
        options.forEach(option => {
            embed.addFields({ name: option.name, value: option.description });
        });

        // Create checkboxes (using buttons, as Discord doesn't have actual checkboxes)
        const rows = options.map(option => {
            // Store default selections in session
            if (option.defaultChecked && !session.selections.hasOwnProperty('features')) {
                session.selections.features = session.selections.features || [];
                session.selections.features.push(option.value);
            }

            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_feature_toggle_${option.value}`)
                    .setLabel(option.name)
                    .setStyle(session.selections.features?.includes(option.value) ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setEmoji(session.selections.features?.includes(option.value) ? '✅' : '⬜')
            );
        });

        // Add navigation buttons
        const navRow = this.createNavigationRow(session);
        rows.push(navRow);

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    /**
     * Show confirmation screen
     * @param {Interaction} interaction
     */
    async showConfirmation(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);
        session.currentState = this.STATES.CONFIRMATION;

        await interaction.deferUpdate();

        // Get current server info for comparison
        const currentCategories = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const currentChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice).size;
        const currentRoles = interaction.guild.roles.cache.size - 1; // Subtract @everyone

        // Calculate new counts based on template
        const templateInfo = configManager.getServerTemplate(session.selections.serverTemplate || 'standard');
        const newCategories = templateInfo.categories.length;
        const newChannels = templateInfo.categories.reduce((count, category) => count + category.channels.length, 0);
        const newRoles = (session.selections.roles?.includes('clan_roles') ? 4 : 0) +
            (session.selections.roles?.includes('th_roles') ? 9 : 0) +
            (session.selections.roles?.includes('war_roles') ? 3 : 0) +
            (session.selections.roles?.includes('special_roles') ? 3 : 0);

        // Create summary of changes
        const embed = new EmbedBuilder()
            .setTitle('Final Confirmation')
            .setDescription('Review your selections before applying changes to your server:')
            .setColor('#e74c3c')
            .addFields(
                { name: 'Server Template', value: session.selections.serverTemplate ? configManager.getTemplateName(session.selections.serverTemplate) : 'Standard' },
                { name: 'Roles to Create', value: session.selections.roles ? session.selections.roles.map(r => configManager.getRoleName(r)).join(', ') : 'None' },
                { name: 'Permission Template', value: session.selections.permissionTemplate ? configManager.getPermissionName(session.selections.permissionTemplate) : 'Standard' },
                { name: 'Features Enabled', value: session.selections.features ? session.selections.features.map(f => configManager.getFeatureName(f)).join(', ') : 'None' },
                { name: 'Current Server', value: `Categories: ${currentCategories}\nChannels: ${currentChannels}\nRoles: ${currentRoles}` },
                { name: 'After Setup', value: `Categories: ${currentCategories + newCategories}\nChannels: ${currentChannels + newChannels}\nRoles: ${currentRoles + newRoles}` }
            )
            .setFooter({ text: '⚠️ This will modify your Discord server structure! ⚠️' });

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_confirm')
                    .setLabel('Apply Changes')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('setup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        // Add navigation buttons
        const navRow = this.createNavigationRow(session, true, false);

        await interaction.editReply({ embeds: [embed], components: [actionRow, navRow] });
    }

    /**
     * Apply all selected changes to the server
     * @param {Interaction} interaction
     */
    async applyChanges(interaction) {
        const session = this.activeSessions.get(interaction.guild.id);

        await interaction.deferUpdate();

        const statusEmbed = new EmbedBuilder()
            .setTitle('🚧 Setting Up Your Server...')
            .setDescription('Please wait while we apply all changes to your server.')
            .setColor('#f39c12');

        await interaction.editReply({ embeds: [statusEmbed], components: [] });

        try {
            // Apply changes based on selections
            const serverTemplate = session.selections.serverTemplate || 'standard';
            const permissionTemplate = session.selections.permissionTemplate || 'standard';
            const selectedRoles = session.selections.roles || [];
            const selectedFeatures = session.selections.features || [];

            // Update status
            statusEmbed.addFields({ name: 'Creating Categories', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [statusEmbed] });

            // 1. Create categories and channels
            const channelsCreated = await serverSetup.createServerStructure(
                interaction.guild,
                serverTemplate
            );
            session.channelsCreated = channelsCreated;

            // Update status
            statusEmbed.data.fields[0].value = '✅ Complete!';
            statusEmbed.addFields({ name: 'Creating Roles', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [statusEmbed] });

            // 2. Create roles
            const rolesCreated = await roleSetup.createRoles(
                interaction.guild,
                selectedRoles
            );
            session.rolesCreated = rolesCreated;

            // Update status
            statusEmbed.data.fields[1].value = '✅ Complete!';
            statusEmbed.addFields({ name: 'Setting Up Permissions', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [statusEmbed] });

            // 3. Set up permissions
            await permissionSetup.setupPermissions(
                interaction.guild,
                permissionTemplate,
                channelsCreated,
                rolesCreated
            );

            // Update status
            statusEmbed.data.fields[2].value = '✅ Complete!';
            statusEmbed.addFields({ name: 'Configuring Features', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [statusEmbed] });

            // 4. Configure features
            if (selectedFeatures.length > 0) {
                await this.configureFeatures(interaction.guild, selectedFeatures, session);
            }

            // Update status
            statusEmbed.data.fields[3].value = '✅ Complete!';
            await interaction.editReply({ embeds: [statusEmbed] });

            // Show completion
            await this.showCompletion(interaction, session);
        } catch (error) {
            console.error('Error applying changes:', error);

            // Show error
            statusEmbed.setTitle('❌ Setup Error')
                .setDescription('An error occurred while setting up your server:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [statusEmbed] });
        }
    }

    /**
     * Show completion screen
     * @param {Interaction} interaction
     * @param {Object} session
     */
    async showCompletion(interaction, session) {
        session.currentState = this.STATES.COMPLETE;

        const categoriesCreated = session.channelsCreated.filter(c => c.type === 'category').length;
        const channelsCreated = session.channelsCreated.filter(c => c.type !== 'category').length;
        const rolesCreated = session.rolesCreated.length;

        const embed = new EmbedBuilder()
            .setTitle('✅ Server Setup Complete!')
            .setDescription('Your Discord server has been successfully set up for Clash of Clans!')
            .setColor('#2ecc71')
            .addFields(
                { name: 'Summary of Changes', value: `Created ${categoriesCreated} categories\nCreated ${channelsCreated} channels\nCreated ${rolesCreated} roles` },
                { name: 'Next Steps', value: '1. Customize your server icon and banner\n2. Update role colors as desired\n3. Use `/help` to learn more about available commands' }
            )
            .setFooter({ text: 'Thank you for using the Discord Server Setup Wizard!' });

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_complete')
                    .setLabel('Got it!')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('👍')
            );

        await interaction.editReply({ embeds: [embed], components: [actionRow] });

        // Clean up session after 5 minutes of inactivity
        setTimeout(() => {
            if (this.activeSessions.has(interaction.guild.id)) {
                this.activeSessions.delete(interaction.guild.id);
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Create navigation row for wizard steps
     * @param {Object} session Current session
     * @param {Boolean} noNext Don't show next button
     * @param {Boolean} noPrev Don't show previous button
     * @returns {ActionRowBuilder}
     */
    createNavigationRow(session, noNext = false, noPrev = false) {
        const row = new ActionRowBuilder();

        // Add previous button if not on the welcome screen
        if (!noPrev) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_prev')
                    .setLabel('Previous Step')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );
        }

        // Add next button if not on the confirmation screen
        if (!noNext) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_next')
                    .setLabel('Next Step')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➡️')
            );
        }

        // Always add cancel button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_cancel')
                .setLabel('Cancel Setup')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        return row;
    }

    /**
     * Navigate to the next or previous step
     * @param {Interaction} interaction
     * @param {String} direction 'next' or 'prev'
     */
    async navigateStep(interaction, direction) {
        const session = this.activeSessions.get(interaction.guild.id);

        // Define the flow of states
        const stateFlow = [
            this.STATES.WELCOME,
            this.STATES.CLAN_SELECTION,
            this.STATES.SERVER_STRUCTURE,
            this.STATES.ROLE_SETUP,
            this.STATES.PERMISSIONS,
            this.STATES.FEATURES,
            this.STATES.CONFIRMATION
        ];

        // Find current index
        const currentIndex = stateFlow.indexOf(session.currentState);
        let nextIndex;

        if (direction === 'next') {
            nextIndex = Math.min(currentIndex + 1, stateFlow.length - 1);
        } else {
            nextIndex = Math.max(currentIndex - 1, 0);
        }

        // Navigate to the next/previous state
        const nextState = stateFlow[nextIndex];
        session.currentState = nextState;

        // Show appropriate screen based on state
        switch (nextState) {
            case this.STATES.WELCOME:
                await this.showWelcomeScreen(interaction);
                break;
            case this.STATES.CLAN_SELECTION:
                await this.showClanSelection(interaction);
                break;
            case this.STATES.SERVER_STRUCTURE:
                await this.showServerStructure(interaction);
                break;
            case this.STATES.ROLE_SETUP:
                await this.showRoleSetup(interaction);
                break;
            case this.STATES.PERMISSIONS:
                await this.showPermissionsSetup(interaction);
                break;
            case this.STATES.FEATURES:
                await this.showFeatureSelection(interaction);
                break;
            case this.STATES.CONFIRMATION:
                await this.showConfirmation(interaction);
                break;
        }
    }

    /**
     * Handle button clicks for the wizard
     * @param {Interaction} interaction
     */
    async handleInteraction(interaction) {
        // Verify this is a button interaction
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
            return false;
        }

        const customId = interaction.customId;

        // Check if this is a setup button
        if (!customId.startsWith('setup_')) {
            return false;
        }

        // Get the session for this guild
        const session = this.activeSessions.get(interaction.guild.id);

        // If no session, ignore the interaction
        if (!session) {
            return false;
        }

        // Check if the user is authorized
        if (session.userId !== interaction.user.id) {
            await interaction.reply({
                content: 'Only the user who started the setup wizard can interact with it.',
                ephemeral: true
            });
            return true;
        }

        // Handle different button actions
        if (customId === 'setup_start') {
            await this.showClanSelection(interaction);
        } else if (customId === 'setup_template') {
            await this.showServerStructure(interaction);
        } else if (customId === 'setup_cancel') {
            this.activeSessions.delete(interaction.guild.id);
            await interaction.update({
                content: 'Setup wizard cancelled.',
                embeds: [],
                components: []
            });
        } else if (customId === 'setup_confirm') {
            await this.applyChanges(interaction);
        } else if (customId === 'setup_next') {
            await this.navigateStep(interaction, 'next');
        } else if (customId === 'setup_prev') {
            await this.navigateStep(interaction, 'prev');
        } else if (customId === 'setup_complete') {
            this.activeSessions.delete(interaction.guild.id);
            await interaction.update({
                content: 'Your server has been set up successfully!',
                embeds: [],
                components: []
            });
        } else if (customId.startsWith('setup_role_toggle_')) {
            // Toggle role selection
            const roleType = customId.replace('setup_role_toggle_', '');
            session.selections.roles = session.selections.roles || [];

            if (session.selections.roles.includes(roleType)) {
                session.selections.roles = session.selections.roles.filter(r => r !== roleType);
            } else {
                session.selections.roles.push(roleType);
            }

            await this.showRoleSetup(interaction);
        } else if (customId.startsWith('setup_feature_toggle_')) {
            // Toggle feature selection
            const featureType = customId.replace('setup_feature_toggle_', '');
            session.selections.features = session.selections.features || [];

            if (session.selections.features.includes(featureType)) {
                session.selections.features = session.selections.features.filter(f => f !== featureType);
            } else {
                session.selections.features.push(featureType);
            }

            await this.showFeatureSelection(interaction);
        } else if (customId === 'setup_use_linked_clan' || customId === 'setup_link_clan') {
            // Handle clan linking
            session.selections.useClan = true;
            await this.showServerStructure(interaction);
        } else if (customId === 'setup_skip_clan' || customId === 'setup_link_different') {
            session.selections.useClan = false;
            await this.showServerStructure(interaction);
        }

        // Handle select menus
        if (interaction.isStringSelectMenu()) {
            if (customId === 'setup_server_template') {
                session.selections.serverTemplate = interaction.values[0];
                await this.showRoleSetup(interaction);
            } else if (customId === 'setup_permissions_template') {
                session.selections.permissionTemplate = interaction.values[0];
                await this.showFeatureSelection(interaction);
            }
        }

        return true;
    }

    /**
     * Apply a pre-configured template to the server
     * @param {Interaction} interaction
     * @param {String} templateName
     */
    async applyTemplate(interaction, templateName) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚧 Applying Server Template...')
                .setDescription(`Applying the **${configManager.getTemplateName(templateName)}** template to your server.`)
                .setColor('#f39c12');

            await interaction.editReply({ embeds: [embed] });

            // Create session to track progress
            const session = {
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                startTime: Date.now(),
                selections: {
                    serverTemplate: templateName,
                    permissionTemplate: 'standard',
                    roles: ['clan_roles', 'th_roles'],
                    features: ['war_announcements', 'member_tracking', 'auto_roles', 'welcome_messages']
                },
                channelsCreated: [],
                rolesCreated: []
            };

            // Apply the template
            embed.addFields({ name: 'Creating Categories and Channels', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [embed] });

            // 1. Create categories and channels
            const channelsCreated = await serverSetup.createServerStructure(
                interaction.guild,
                templateName
            );
            session.channelsCreated = channelsCreated;

            // Update status
            embed.data.fields[0].value = '✅ Complete!';
            embed.addFields({ name: 'Creating Roles', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [embed] });

            // 2. Create roles
            const rolesCreated = await roleSetup.createRoles(
                interaction.guild,
                session.selections.roles
            );
            session.rolesCreated = rolesCreated;

            // Update status
            embed.data.fields[1].value = '✅ Complete!';
            embed.addFields({ name: 'Setting Up Permissions', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [embed] });

            // 3. Set up permissions
            await permissionSetup.setupPermissions(
                interaction.guild,
                'standard',
                channelsCreated,
                rolesCreated
            );

            // Update status
            embed.data.fields[2].value = '✅ Complete!';
            embed.addFields({ name: 'Configuring Features', value: '⏳ In progress...' });
            await interaction.editReply({ embeds: [embed] });

            // 4. Configure features
            await this.configureFeatures(interaction.guild, session.selections.features, session);

            // Update status
            embed.data.fields[3].value = '✅ Complete!';
            await interaction.editReply({ embeds: [embed] });

            // Show completion message
            const completionEmbed = new EmbedBuilder()
                .setTitle('✅ Server Template Applied!')
                .setDescription(`The **${configManager.getTemplateName(templateName)}** template has been applied to your server.`)
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Summary', value: `Created ${channelsCreated.filter(c => c.type === 'category').length} categories\nCreated ${channelsCreated.filter(c => c.type !== 'category').length} channels\nCreated ${rolesCreated.length} roles` },
                    { name: 'Next Steps', value: '1. Customize your server icon and banner\n2. Update role colors as desired\n3. Use `/help` to learn more about available commands' }
                );

            await interaction.editReply({ embeds: [completionEmbed] });
        } catch (error) {
            console.error('Error applying template:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Applying Template')
                .setDescription('An error occurred while applying the template:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Set up roles only
     * @param {Interaction} interaction
     */
    async setupRoles(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚧 Setting Up Roles...')
                .setDescription('Creating roles for your Clash of Clans server.')
                .setColor('#f39c12');

            await interaction.editReply({ embeds: [embed] });

            // Create all role types
            const roleTypes = ['clan_roles', 'th_roles', 'war_roles', 'special_roles'];
            const rolesCreated = await roleSetup.createRoles(interaction.guild, roleTypes);

            // Show completion message
            const completionEmbed = new EmbedBuilder()
                .setTitle('✅ Roles Created!')
                .setDescription(`Created ${rolesCreated.length} roles for your server.`)
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Created Roles', value: rolesCreated.map(r => r.name).join('\n') },
                    { name: 'Next Steps', value: 'Use `/roles sync` to automatically assign roles based on clan membership' }
                );

            await interaction.editReply({ embeds: [completionEmbed] });
        } catch (error) {
            console.error('Error setting up roles:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Setting Up Roles')
                .setDescription('An error occurred while creating roles:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Set up channels only
     * @param {Interaction} interaction
     */
    async setupChannels(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚧 Setting Up Channels...')
                .setDescription('Creating categories and channels for your Clash of Clans server.')
                .setColor('#f39c12');

            await interaction.editReply({ embeds: [embed] });

            // Create server structure with standard template
            const channelsCreated = await serverSetup.createServerStructure(interaction.guild, 'standard');

            // Show completion message
            const categoriesCreated = channelsCreated.filter(c => c.type === 'category').length;
            const textChannelsCreated = channelsCreated.filter(c => c.type === 'text').length;
            const voiceChannelsCreated = channelsCreated.filter(c => c.type === 'voice').length;

            const completionEmbed = new EmbedBuilder()
                .setTitle('✅ Channels Created!')
                .setDescription(`Created ${channelsCreated.length} categories and channels for your server.`)
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Summary', value: `${categoriesCreated} categories\n${textChannelsCreated} text channels\n${voiceChannelsCreated} voice channels` }
                );

            await interaction.editReply({ embeds: [completionEmbed] });
        } catch (error) {
            console.error('Error setting up channels:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Setting Up Channels')
                .setDescription('An error occurred while creating channels:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Set up permissions only
     * @param {Interaction} interaction
     */
    async setupPermissions(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚧 Setting Up Permissions...')
                .setDescription('Configuring permissions for your Clash of Clans server.')
                .setColor('#f39c12');

            await interaction.editReply({ embeds: [embed] });

            // Create select menu for permission template
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('permission_template')
                .setPlaceholder('Select a permission template')
                .addOptions([
                    { label: 'Standard Permissions', value: 'standard', description: 'Balanced permissions for most clans' },
                    { label: 'Strict Permissions', value: 'strict', description: 'More controlled environment' },
                    { label: 'Open Permissions', value: 'open', description: 'More community-driven approach' }
                ]);

            const actionRow = new ActionRowBuilder().addComponents(selectMenu);

            const selectionEmbed = new EmbedBuilder()
                .setTitle('Choose a Permission Template')
                .setDescription('Select how you want to configure permissions:')
                .setColor('#3498db')
                .addFields(
                    { name: 'Standard', value: 'Balanced permissions with role hierarchy' },
                    { name: 'Strict', value: 'More restricted access for lower roles' },
                    { name: 'Open', value: 'More open access for all members' }
                );

            await interaction.editReply({ embeds: [selectionEmbed], components: [actionRow] });

            // Wait for selection
            const filter = i => i.customId === 'permission_template' && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const template = i.values[0];
                await i.deferUpdate();

                const progressEmbed = new EmbedBuilder()
                    .setTitle('🚧 Setting Up Permissions...')
                    .setDescription(`Applying ${template} permissions to your server.`)
                    .setColor('#f39c12');

                await interaction.editReply({ embeds: [progressEmbed], components: [] });

                // Apply permissions
                await permissionSetup.setupPermissions(
                    interaction.guild,
                    template,
                    interaction.guild.channels.cache.map(c => ({
                        id: c.id,
                        name: c.name,
                        type: c.type
                    })),
                    interaction.guild.roles.cache.map(r => ({
                        id: r.id,
                        name: r.name
                    }))
                );

                // Show completion message
                const completionEmbed = new EmbedBuilder()
                    .setTitle('✅ Permissions Configured!')
                    .setDescription(`Applied ${template} permissions to your server.`)
                    .setColor('#2ecc71');

                await interaction.editReply({ embeds: [completionEmbed] });

                collector.stop();
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.editReply({
                        content: 'Permission setup timed out. Please try again.',
                        embeds: [],
                        components: []
                    });
                }
            });
        } catch (error) {
            console.error('Error setting up permissions:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Setting Up Permissions')
                .setDescription('An error occurred while configuring permissions:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Sync server with clan data
     * @param {Interaction} interaction
     */
    async syncWithClan(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚧 Syncing Server...')
                .setDescription('Synchronizing server with Clash of Clans clan data.')
                .setColor('#f39c12');

            await interaction.editReply({ embeds: [embed] });

            // Find linked clan for this Discord server
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

            if (!linkedClan) {
                return interaction.editReply("This server doesn't have a linked clan. Use `/setclan` first.");
            }

            // Get clan data
            const clanData = await clashApiService.getClan(linkedClan.clanTag);

            // Sync roles
            const rolesSynced = await roleSetup.syncRolesWithClan(interaction.guild, clanData);

            // Show completion message
            const completionEmbed = new EmbedBuilder()
                .setTitle('✅ Server Synced!')
                .setDescription(`Synchronized server with ${clanData.name} (${clanData.tag})`)
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Members Synced', value: `${rolesSynced.members} out of ${clanData.members}` },
                    { name: 'Roles Assigned', value: `${rolesSynced.roles} role assignments` }
                );

            await interaction.editReply({ embeds: [completionEmbed] });
        } catch (error) {
            console.error('Error syncing with clan:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Syncing Server')
                .setDescription('An error occurred while syncing with clan data:')
                .setColor('#e74c3c')
                .addFields({ name: 'Error Message', value: error.message });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Configure selected features
     * @param {Guild} guild
     * @param {Array} features
     * @param {Object} session
     */
    async configureFeatures(guild, features, session) {
        // Configure each selected feature
        if (features.includes('war_announcements')) {
            // Find war announcement channel
            const warChannel = guild.channels.cache.find(c =>
                c.name.includes('war-announcements') ||
                c.name.includes('war-log') ||
                c.name.includes('war-results')
            );

            if (warChannel) {
                // Update clan settings if a clan is linked
                const linkedClan = await Clan.findOne({ guildId: guild.id });
                if (linkedClan) {
                    // Ensure settings structure exists
                    if (!linkedClan.settings) linkedClan.settings = {};
                    if (!linkedClan.settings.channels) linkedClan.settings.channels = {};

                    // Set war announcements channel
                    linkedClan.settings.channels.warAnnouncements = warChannel.id;

                    // Enable war notifications
                    if (!linkedClan.settings.notifications) linkedClan.settings.notifications = {};
                    linkedClan.settings.notifications.warStart = true;
                    linkedClan.settings.notifications.warEnd = true;

                    await linkedClan.save();
                }
            }
        }

        if (features.includes('welcome_messages')) {
            // Find welcome channel
            const welcomeChannel = guild.channels.cache.find(c =>
                c.name.includes('welcome') ||
                c.name.includes('join') ||
                c.name.includes('intro')
            );

            if (welcomeChannel) {
                // Create welcome message
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('Welcome to our Clash of Clans Server!')
                    .setDescription('Thank you for joining our clan\'s Discord server! Here you can interact with fellow clan members, get war updates, and more.')
                    .setColor('#2ecc71')
                    .addFields(
                        { name: 'Getting Started', value: '1. Check out our rules in the rules channel\n2. Introduce yourself in the introductions channel\n3. Link your Clash of Clans account with `/link`' },
                        { name: 'Important Channels', value: '• #announcements - Important clan news\n• #war-room - War planning and strategies\n• #general - General chat' }
                    );

                // Only post it if there are no recent messages
                const messages = await welcomeChannel.messages.fetch({ limit: 5 });
                if (messages.size === 0) {
                    await welcomeChannel.send({ embeds: [welcomeEmbed] });
                }
            }
        }

        // Additional features will be configured here
    }
}

// Export a single instance of the service
module.exports = new SetupWizardService();