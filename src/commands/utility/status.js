const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status'),

    async execute(interaction) {
        await interaction.reply('Bot is online and responding to commands!');
    }
};