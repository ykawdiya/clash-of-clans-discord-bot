// src/commands/admin/apitest.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const { system: log } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apitest')
        .setDescription('Test Clash of Clans API connection')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Test API connection
            log.info('API test command executed by ' + interaction.user.tag);

            const connectionSuccess = await clashApiService.testConnection();

            // Log proxy details (not shown to user)
            if (process.env.PROXY_HOST) {
                log.info(`Testing with proxy: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
            } else {
                log.info('Testing with direct connection (no proxy)');
            }

            if (connectionSuccess) {
                await interaction.editReply({
                    content: `✅ API connection test successful! The bot can communicate with the Clash of Clans API.`
                });
            } else {
                await interaction.editReply({
                    content: `❌ API connection test failed. Please check your API token${process.env.PROXY_HOST ? ' and proxy settings' : ''}.`
                });
            }
        } catch (error) {
            log.error('Error executing apitest command:', { error: error.message });

            await interaction.editReply({
                content: `❌ Error testing API connection: ${error.message}`
            });
        }
    }
};