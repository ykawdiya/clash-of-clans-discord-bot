// src/commands/utility/botstatus.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const statusMonitor = require('../../utils/statusMonitor');
const clashApiService = require('../../services/clashApiService');
const databaseService = require('../../services/databaseService');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botstatus')
        .setDescription('Check the status and health of the bot'),

    category: 'Utility',

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get status information
            const status = statusMonitor.getStatusReport();
            const apiStatus = clashApiService.getStatus();
            const dbStatus = databaseService.getStatus();

            // Get system info
            const memoryUsage = process.memoryUsage();
            const systemMemory = {
                total: os.totalmem(),
                free: os.freemem()
            };

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('Clash of Clans Bot Status')
                .setDescription(`Bot has been running for ${status.uptime}`)
                .addFields(
                    { name: 'Commands Processed', value: status.commandsProcessed.toString(), inline: true },
                    { name: 'Memory Usage', value: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`, inline: true },
                    { name: 'System Load', value: os.loadavg().map(load => load.toFixed(2)).join(', '), inline: true },
                    {
                        name: 'API Status',
                        value: `Success Rate: ${status.apiCalls.successRate}\nCalls: ${status.apiCalls.total}\nProxy: ${apiStatus.proxyConfigured ? 'Configured' : 'Not Configured'}`,
                        inline: true
                    },
                    {
                        name: 'Database Status',
                        value: `Connected: ${dbStatus.isConnected ? 'Yes' : 'No'}\nState: ${getReadyStateText(dbStatus.readyState)}`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Clash of Clans Discord Bot' })
                .setTimestamp();

            // Add recent errors if any
            if (status.lastErrors.length > 0) {
                const errorText = status.lastErrors
                    .slice(-3) // Show only the 3 most recent
                    .map(err => `[${new Date(err.timestamp).toLocaleTimeString()}] ${err.type}: ${err.message}`)
                    .join('\n');

                embed.addFields({ name: 'Recent Errors', value: errorText });
            }

            // Run a quick health check on API
            try {
                const apiResult = await clashApiService.testProxyConnection();
                embed.addFields({
                    name: 'API Connection Test',
                    value: apiResult.success ? '✅ Working' : `❌ Failed: ${apiResult.message}`,
                    inline: true
                });
            } catch (error) {
                embed.addFields({
                    name: 'API Connection Test',
                    value: `❌ Failed: ${error.message}`,
                    inline: true
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in botstatus command:', error);
            return interaction.editReply('An error occurred while fetching bot status.');
        }
    },
};

function getReadyStateText(state) {
    switch(state) {
        case 0: return 'Disconnected';
        case 1: return 'Connected';
        case 2: return 'Connecting';
        case 3: return 'Disconnecting';
        default: return 'Unknown';
    }
}