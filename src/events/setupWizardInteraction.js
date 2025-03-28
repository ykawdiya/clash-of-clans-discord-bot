// src/events/setupWizardInteraction.js
const { Events } = require('discord.js');
const setupWizardService = require('../services/setupWizardService');

module.exports = {
    // Change the name to a custom event name, but still listen to InteractionCreate
    name: "customSetupInteraction", // This ensures we don't register duplicate handlers
    event: Events.InteractionCreate, // We still want to handle interaction events

    async execute(client, interaction) {
        try {
            // Only process setup-related interactions
            if (!interaction.customId || !interaction.customId.startsWith('setup_')) {
                return; // Skip non-setup interactions entirely
            }

            // Process button/select menu interactions for the setup wizard
            if (interaction.isButton() || interaction.isStringSelectMenu()) {
                // Add detailed logging for debugging
                console.log(`Processing setup wizard interaction: ${interaction.customId} | User: ${interaction.user.tag} | Guild: ${interaction.guild?.name || 'DM'}`);

                try {
                    // Let the wizard service handle it
                    const handled = await setupWizardService.handleInteraction(interaction);

                    // Log the result
                    if (handled) {
                        console.log(`Setup wizard successfully handled interaction: ${interaction.customId}`);
                    } else {
                        console.log(`Setup wizard did not handle interaction: ${interaction.customId}`);
                    }

                    // Either way, we want to exit this handler
                    return;
                } catch (error) {
                    console.error(`Error in setup wizard handling interaction ${interaction.customId}:`, error);

                    // Try to respond if we can
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: "There was an error processing your request. Please try again or restart the setup wizard.",
                            ephemeral: true
                        }).catch(e => console.error('Failed to send error response:', e));
                    }
                    return;
                }
            }

            // Handle modal submissions for setup
            if (interaction.isModalSubmit() && interaction.customId === 'server_setup_confirmation') {
                console.log(`Setup modal submission received: ${interaction.customId}`);

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
                } catch (error) {
                    console.error('Error handling confirmation modal:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'Error processing your confirmation. Please try the setup wizard again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
                return;
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