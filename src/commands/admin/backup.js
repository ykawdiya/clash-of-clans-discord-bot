// src/commands/admin/backup.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const serverBackup = require('../../utils/serverBackup');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Manage server backups')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a backup of the server structure'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List available backups'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restore from a backup')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Backup ID to restore from')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Admin',

    manualDeferring: true,

    longDescription: 'Create and manage backups of your Discord server structure. This includes channels, categories, and roles. You can restore from a backup if needed, which is useful after running the setup wizard.',

    examples: [
        '/backup create',
        '/backup list',
        '/backup restore',
        '/backup restore id:backup_1234567890'
    ],

    async execute(interaction) {
        try {
            // Only server admins can use this command
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: 'You need Administrator permission to use the backup command.',
                    ephemeral: true
                });
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await createBackup(interaction);
                    break;
                case 'list':
                    await listBackups(interaction);
                    break;
                case 'restore':
                    await restoreBackup(interaction);
                    break;
                default:
                    return interaction.reply({
                        content: 'Unknown subcommand.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in backup command:', error);

            // If not already replied, reply with error
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply(ErrorHandler.formatError(error, 'server backup'));
            } else if (interaction.deferred) {
                return interaction.editReply(ErrorHandler.formatError(error, 'server backup'));
            }
        }
    },
};

/**
 * Create a backup of the server
 * @param {Interaction} interaction
 */
async function createBackup(interaction) {
    await interaction.deferReply();

    try {
        const embed = new EmbedBuilder()
            .setTitle('Creating Server Backup...')
            .setDescription('Please wait while I create a backup of your server structure.')
            .setColor('#f39c12');

        await interaction.editReply({ embeds: [embed] });

        // Create the backup
        const backup = await serverBackup.createBackup(interaction.guild);

        // Build success message
        const successEmbed = new EmbedBuilder()
            .setTitle('Server Backup Created')
            .setDescription(`Successfully created a backup of ${interaction.guild.name}.`)
            .setColor('#2ecc71')
            .addFields(
                { name: 'Backup ID', value: backup.backupId || 'Unknown', inline: true },
                { name: 'Timestamp', value: new Date(backup.timestamp).toLocaleString(), inline: true },
                { name: 'Contents', value: `${backup.channels.length} channels\n${backup.roles.length} roles` },
                { name: 'Usage', value: 'Use `/backup restore id:' + backup.backupId + '` to restore from this backup.' }
            );

        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error creating backup:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Backup Failed')
            .setDescription('An error occurred while creating the backup.')
            .setColor('#e74c3c')
            .addFields({ name: 'Error Message', value: error.message });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * List available backups
 * @param {Interaction} interaction
 */
async function listBackups(interaction) {
    await interaction.deferReply();

    try {
        // Get list of backups
        const backups = await serverBackup.listBackups(interaction.guild.id);

        if (backups.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('No Backups Found')
                .setDescription('No backups found for this server. Create one with `/backup create`.')
                .setColor('#e74c3c');

            return interaction.editReply({ embeds: [embed] });
        }

        // Create embed for backup list
        const embed = new EmbedBuilder()
            .setTitle('Server Backups')
            .setDescription(`Found ${backups.length} backup(s) for ${interaction.guild.name}.`)
            .setColor('#3498db')
            .setFooter({ text: 'Use /backup restore to restore from a backup' });

        // Add each backup to the embed (limit to 10 most recent)
        backups.slice(0, 10).forEach(backup => {
            embed.addFields({
                name: `Backup ${backup.backupId}`,
                value: `Created: ${new Date(backup.timestamp).toLocaleString()}\nChannels: ${backup.channelCount}\nRoles: ${backup.roleCount}`
            });
        });

        // If there are backups, create a select menu for quick restore
        let components = [];
        if (backups.length > 0) {
            const selectOptions = backups.slice(0, 25).map(backup => ({
                label: `Backup from ${new Date(backup.timestamp).toLocaleString()}`,
                value: backup.backupId,
                description: `${backup.channelCount} channels, ${backup.roleCount} roles`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('backup_select')
                .setPlaceholder('Select a backup to restore')
                .addOptions(selectOptions);

            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    } catch (error) {
        console.error('Error listing backups:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Error Listing Backups')
            .setDescription('An error occurred while listing backups.')
            .setColor('#e74c3c')
            .addFields({ name: 'Error Message', value: error.message });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Restore from a backup
 * @param {Interaction} interaction
 */
async function restoreBackup(interaction) {
    // Check if a backup ID was provided
    const backupId = interaction.options.getString('id');

    if (backupId) {
        await restoreFromBackupId(interaction, backupId);
        return;
    }

    // No backup ID provided, show list for selection
    await interaction.deferReply();

    try {
        // Get list of backups
        const backups = await serverBackup.listBackups(interaction.guild.id);

        if (backups.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('No Backups Found')
                .setDescription('No backups found for this server. Create one with `/backup create`.')
                .setColor('#e74c3c');

            return interaction.editReply({ embeds: [embed] });
        }

        // Create embed for backup selection
        const embed = new EmbedBuilder()
            .setTitle('Select a Backup to Restore')
            .setDescription(`Please select which backup you want to restore from. **This will modify your server structure!**`)
            .setColor('#e74c3c')
            .addFields(
                { name: '⚠️ Warning', value: 'Restoring a backup will not delete existing channels or roles, but it will attempt to recreate any missing ones from the backup.' }
            );

        // Add most recent backup details
        const latestBackup = backups[0];
        embed.addFields({
            name: 'Most Recent Backup',
            value: `Created: ${new Date(latestBackup.timestamp).toLocaleString()}\nChannels: ${latestBackup.channelCount}\nRoles: ${latestBackup.roleCount}`
        });

        // Create select menu for backups
        const selectOptions = backups.slice(0, 25).map(backup => ({
            label: `Backup from ${new Date(backup.timestamp).toLocaleString()}`,
            value: backup.backupId,
            description: `${backup.channelCount} channels, ${backup.roleCount} roles`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('backup_restore_select')
            .setPlaceholder('Select a backup to restore')
            .addOptions(selectOptions);

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        // Add buttons for quick actions
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`backup_restore_latest`)
                    .setLabel('Restore Latest Backup')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('backup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [menuRow, buttonRow]
        });
    } catch (error) {
        console.error('Error preparing backup restoration:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Error Preparing Restoration')
            .setDescription('An error occurred while preparing to restore from backup.')
            .setColor('#e74c3c')
            .addFields({ name: 'Error Message', value: error.message });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Restore from a specific backup ID
 * @param {Interaction} interaction
 * @param {string} backupId
 */
async function restoreFromBackupId(interaction, backupId) {
    await interaction.deferReply();

    try {
        // Ask for confirmation first
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirm Backup Restoration')
            .setDescription(`Are you sure you want to restore from backup **${backupId}**?\n\nThis will attempt to recreate any missing channels and roles from the backup.`)
            .setColor('#e74c3c')
            .addFields(
                { name: 'Important Note', value: 'This will not delete any existing channels or roles, only create missing ones.' }
            );

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`backup_confirm_${backupId}`)
                    .setLabel('Yes, Restore Backup')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('backup_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmRow]
        });
    } catch (error) {
        console.error('Error preparing backup restoration:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Error Preparing Restoration')
            .setDescription('An error occurred while preparing to restore from backup.')
            .setColor('#e74c3c')
            .addFields({ name: 'Error Message', value: error.message });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Handle backup confirmation
 * @param {Interaction} interaction Button interaction
 * @param {string} backupId Backup ID to restore
 */
async function handleRestoreConfirmation(interaction, backupId) {
    await interaction.update({
        content: 'Restoring backup...',
        embeds: [],
        components: []
    });

    try {
        // Get the backup
        const backup = await serverBackup.loadBackup(interaction.guild.id, backupId);

        // Create progress embed
        const progressEmbed = new EmbedBuilder()
            .setTitle('Restoring Server Backup...')
            .setDescription(`Restoring backup ${backupId} for ${interaction.guild.name}.`)
            .setColor('#f39c12');

        await interaction.editReply({ embeds: [progressEmbed] });

        // Restore the backup
        const results = await serverBackup.restoreFromBackup(interaction.guild, backup);

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('Backup Restored')
            .setDescription(`Successfully restored backup ${backupId} for ${interaction.guild.name}.`)
            .setColor('#2ecc71')
            .addFields(
                { name: 'Channels Restored', value: `${results.channelsRestored}/${backup.channels.length}`, inline: true },
                { name: 'Roles Restored', value: `${results.rolesRestored}/${backup.roles.length}`, inline: true }
            );

        if (results.errors.length > 0) {
            // Add first few errors
            const errorSummary = results.errors.slice(0, 3).map(e => e.message).join('\n');
            successEmbed.addFields({
                name: `Errors (${results.errors.length} total)`,
                value: errorSummary + (results.errors.length > 3 ? '\n...and more' : '')
            });
        }

        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('Error restoring backup:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('Restoration Failed')
            .setDescription('An error occurred while restoring the backup.')
            .setColor('#e74c3c')
            .addFields({ name: 'Error Message', value: error.message });

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// Export the handler for button interactions
module.exports.handleBackupInteraction = async function(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return false;
    }

    const customId = interaction.customId;

    // Check if this is a backup-related interaction
    if (!customId.startsWith('backup_')) {
        return false;
    }

    // Only allow administrators
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
            content: 'You need Administrator permission to use backup functions.',
            ephemeral: true
        });
        return true;
    }

    try {
        // Handle backup confirmation
        if (customId.startsWith('backup_confirm_')) {
            const backupId = customId.replace('backup_confirm_', '');
            await handleRestoreConfirmation(interaction, backupId);
            return true;
        }

        // Handle backup cancellation
        if (customId === 'backup_cancel') {
            await interaction.update({
                content: 'Backup restoration cancelled.',
                embeds: [],
                components: []
            });
            return true;
        }

        // Handle backup selection from list
        if (customId === 'backup_select' || customId === 'backup_restore_select') {
            if (interaction.isStringSelectMenu()) {
                const selectedBackupId = interaction.values[0];
                await restoreFromBackupId(interaction, selectedBackupId);
                return true;
            }
        }

        // Handle restore latest backup
        if (customId === 'backup_restore_latest') {
            // Get latest backup
            const backups = await serverBackup.listBackups(interaction.guild.id);
            if (backups.length > 0) {
                const latestBackupId = backups[0].backupId;
                await restoreFromBackupId(interaction, latestBackupId);
                return true;
            } else {
                await interaction.update({
                    content: 'No backups found to restore.',
                    embeds: [],
                    components: []
                });
                return true;
            }
        }
    } catch (error) {
        console.error('Error handling backup interaction:', error);

        // Try to respond if possible
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: 'An error occurred while processing your request.',
                    embeds: [],
                    components: []
                });
            } else {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        } catch (responseError) {
            console.error('Error sending error response:', responseError);
        }

        return true;
    }

    return false;
};