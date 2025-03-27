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
                    // Let the wizard service handle it
                    const handled = await setupWizardService.handleInteraction(interaction);

                    // If it was handled by the wizard, stop here
                    if (handled) return;
                }

                // Add handling for other button/menu interactions here...
            }

            // Add handling for modal submissions
            if (interaction.isModalSubmit()) {
                if (interaction.customId === 'server_setup_confirmation') {
                    // Handle confirmation modal
                    await setupWizardService.handleConfirmationModal(interaction);
                    return;
                }

                // Add handling for other modals here...
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