const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status'),

    async execute(interaction) {
        // Check if the interaction is already handled
        if (interaction.replied || interaction.deferred) {
            console.warn('Status command received an already handled interaction');
            return;
        }

        try {
            // For simple commands, direct reply is fine
            await interaction.reply('Bot is online and responding to commands!');
        } catch (error) {
            console.error('Error in status command:', error);

            // Try to handle the error gracefully
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while checking status',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
};