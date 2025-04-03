const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-echo')
        .setDescription('Echoes back your message')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to echo back')
                .setRequired(true)),

    async execute(interaction) {
        const message = interaction.options.getString('message');
        await interaction.reply(`You said: ${message}`);
    }
};