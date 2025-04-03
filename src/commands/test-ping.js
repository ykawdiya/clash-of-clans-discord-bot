const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-ping')
        .setDescription('Simple ping command for testing'),

    async execute(interaction) {
        await interaction.reply('Pong! Bot is working!');
    }
};