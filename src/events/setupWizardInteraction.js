// src/events/setupWizardInteraction.js
const { Events } = require('discord.js');
const setupWizardService = require('../services/setupWizardService');

module.exports = {
    name: Events.InteractionCreate,

    async execute(client, interaction) {
        try {
            // Process button/select menu interactions for the setup wizard
            if (interaction.isButton() || interaction.isStringSelectMenu()) {
                // Check if this is a setup wizard interaction
                if (interaction.customId.startsWith('setup_')) {
                    console.log(`Processing setup wizard interaction: ${interaction.customId}`);
                    // Let the wizard service handle it
                    const handled = await setupWizardService.handleInteraction(interaction);

                    // If it was handled by the wizard, stop here
                    if (handled) return;
                }

                // Check for backup-related interactions
                if (interaction.customId.startsWith('backup_')) {
                    try {
                        const backupCommand = require('../commands/admin/backup');
                        if (backupCommand.handleBackupInteraction) {
                            const handled = await backupCommand.handleBackupInteraction(interaction);
                            if (handled) return;
                        }
                    } catch (error) {
                        console.error('Error handling backup interaction:', error);
                    }
                }

                // Check for event-related interactions
                if (interaction.customId.startsWith('join_') ||
                    interaction.customId.startsWith('tentative_') ||
                    interaction.customId.startsWith('decline_') ||
                    interaction.customId.startsWith('info_') ||
                    interaction.customId.startsWith('edit_') ||
                    interaction.customId.startsWith('cancel_')) {
                    try {
                        const eventCommand = require('../commands/events/event');
                        if (eventCommand.handleEventInteraction) {
                            const handled = await eventCommand.handleEventInteraction(interaction);
                            if (handled) return;
                        }
                    } catch (error) {
                        console.error('Error handling event interaction:', error);
                    }
                }
            }

            // Add handling for modal submissions
            if (interaction.isModalSubmit()) {
                console.log(`Modal submission received: ${interaction.customId}`);

                if (interaction.customId === 'server_setup_confirmation') {
                    // Handle confirmation modal
                    await setupWizardService.handleConfirmationModal(interaction);
                    return;
                }

                // Handle any event-related modals
                if (interaction.customId.startsWith('approved_notes_') ||
                    interaction.customId.startsWith('rejected_notes_') ||
                    interaction.customId.startsWith('waitlisted_notes_')) {
                    try {
                        const eventCommand = require('../commands/events/event');
                        if (eventCommand.handleEventModalSubmit) {
                            const handled = await eventCommand.handleEventModalSubmit(interaction);
                            if (handled) return;
                        }
                    } catch (error) {
                        console.error('Error handling event modal submission:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling setup wizard interaction:', error);

            // Try to respond to the user if possible
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your interaction.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    },
};