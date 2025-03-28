// src/events/setupWizardInteraction.js
const { Events } = require('discord.js');
const setupWizardService = require('../services/setupWizardService');

module.exports = {
    name: Events.InteractionCreate,

    async execute(client, interaction) {
        try {
            // Process button/select menu interactions for the setup wizard
            if (interaction.isButton() || interaction.isStringSelectMenu()) {
                // Prioritize setup wizard interactions
                if (interaction.customId.startsWith('setup_')) {
                    // Add detailed logging for debugging
                    console.log(`Processing setup wizard interaction: ${interaction.customId} | User: ${interaction.user.tag} | Guild: ${interaction.guild?.name || 'DM'}`);

                    try {
                        // Let the wizard service handle it
                        const handled = await setupWizardService.handleInteraction(interaction);

                        // If it was handled by the wizard, stop here to prevent further processing
                        if (handled) {
                            console.log(`Setup wizard successfully handled interaction: ${interaction.customId}`);
                            return;
                        } else {
                            console.log(`Setup wizard did not handle interaction: ${interaction.customId}`);
                        }
                    } catch (error) {
                        console.error(`Error in setup wizard handling interaction ${interaction.customId}:`, error);

                        // Try to respond if we can
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: "There was an error processing your request. Please try again or restart the setup wizard.",
                                ephemeral: true
                            }).catch(e => console.error('Failed to send error response:', e));
                        }
                        return; // Don't proceed to other handlers if the setup wizard threw an error
                    }
                }

                // Check for backup-related interactions - only if not handled by setup wizard
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

                // Check for event-related interactions - only if not handled by setup wizard
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

                // The handleConfirmationModal method doesn't exist in our setupWizardService
                // Let's handle this more safely
                if (interaction.customId === 'server_setup_confirmation') {
                    try {
                        // Check if the method exists before calling it
                        if (typeof setupWizardService.handleConfirmationModal === 'function') {
                            await setupWizardService.handleConfirmationModal(interaction);
                        } else {
                            console.error('handleConfirmationModal method not found in setupWizardService');
                            await interaction.reply({
                                content: 'This feature is not yet implemented. Please use the regular setup flow.',
                                ephemeral: true
                            });
                        }
                        return;
                    } catch (error) {
                        console.error('Error handling confirmation modal:', error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: 'Error processing your confirmation. Please try the setup wizard again.',
                                ephemeral: true
                            }).catch(console.error);
                        }
                        return;
                    }
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
            console.error('Error in setupWizardInteraction event handler:', error);

            // Try to respond to the user if possible
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your interaction.',
                    ephemeral: true
                }).catch(e => console.error('Failed to send error response:', e));
            }
        }
    },
};