// src/commands/admin/setup.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const setupWizardService = require('../../services/setupWizardService');
const configManager = require('../../utils/configManager');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup your Discord server for Clash of Clans')
        .addSubcommand(subcommand =>
            subcommand
                .setName('wizard')
                .setDescription('Start interactive setup wizard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('template')
                .setDescription('Apply a pre-configured server template')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Which template to apply')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Standard Clan', value: 'standard' },
                            { name: 'War-focused', value: 'war' },
                            { name: 'Competitive', value: 'competitive' },
                            { name: 'Family Friendly', value: 'family' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Set up clan roles from in-game data'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('channels')
                .setDescription('Set up categories and channels'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissions')
                .setDescription('Configure server-wide permissions'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync server with clan data'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Admin',

    manualDeferring: true,

    longDescription: 'Complete Discord server setup wizard for Clash of Clans clans. Create categories, channels, roles, and set permissions automatically. You can use the interactive wizard for a step-by-step guide or apply pre-configured templates instantly.',

    examples: [
        '/setup wizard',
        '/setup template template:standard',
        '/setup roles',
        '/setup channels',
        '/setup permissions'
    ],

    async execute(interaction) {
        try {
            // Only server admins can use this command
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: 'You need Administrator permission to use the setup command.',
                    ephemeral: true
                });
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            // For template, we defer now but for wizard we'll defer within the service
            if (subcommand !== 'wizard') {
                await interaction.deferReply();
            }

            switch (subcommand) {
                case 'wizard':
                    await setupWizardService.startWizard(interaction);
                    break;
                case 'template':
                    const templateName = interaction.options.getString('template');
                    await setupWizardService.applyTemplate(interaction, templateName);
                    break;
                case 'roles':
                    await setupWizardService.setupRoles(interaction);
                    break;
                case 'channels':
                    await setupWizardService.setupChannels(interaction);
                    break;
                case 'permissions':
                    await setupWizardService.setupPermissions(interaction);
                    break;
                case 'sync':
                    await setupWizardService.syncWithClan(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in setup command:', error);

            if (interaction.deferred) {
                return interaction.editReply(ErrorHandler.formatError(error, 'server setup'));
            } else {
                return interaction.reply({
                    content: 'An error occurred during setup. Please try again.',
                    ephemeral: true
                });
            }
        }
    },
};