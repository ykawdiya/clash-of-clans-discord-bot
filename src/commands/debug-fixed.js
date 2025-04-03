// src/commands/debug-fixed.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Simple test command'),

    async execute(interaction) {
        // Most basic response possible
        return interaction.reply('✅ Test successful! Bot is working!');
    }
};