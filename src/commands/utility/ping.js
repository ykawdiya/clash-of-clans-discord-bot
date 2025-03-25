const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    async execute(interaction) {
        try {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            await interaction.editReply(`🏓 Pong!\n- **Bot Latency:** ${latency}ms\n- **API Latency:** ${Math.round(interaction.client.ws.ping)}ms`);
        } catch (error) {
            console.error('Ping command failed:', error);
            return interaction.reply({ content: 'Failed to retrieve latency.', ephemeral: true });
        }
    },
};