const { SlashCommandBuilder } = require('discord.js');

// Add this at the top of the file
const { getModel } = require('../../models/modelRegistry');

// Then, instead of:
// const Base = mongoose.model('Base', baseSchema);

// Use:
const Base = getModel('Base', baseSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Latency: ${latency}ms | API Latency: ${Math.round(interaction.client.ws.ping)}ms`);
    },
};