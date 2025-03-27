const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    // Add this flag to tell the handler not to auto-defer
    manualDeferring: true,

    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Latency: ${latency}ms | API Latency: ${Math.round(interaction.client.ws.ping)}ms`);
    },
};