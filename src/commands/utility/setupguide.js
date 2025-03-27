// Add this to a new file: src/commands/utility/setupguide.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupguide')
        .setDescription('Get a guide for setting up your CoC-themed Discord server'),

    category: 'Utility',

    manualDeferring: true,

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Clash of Clans Server Setup Guide')
            .setDescription('Follow these steps to set up your CoC-themed Discord server:')
            .addFields(
                { name: '1. Create Categories', value: 'Clan Hall, War Base, Village, and War Council' },
                { name: '2. Create Channels', value: '#welcome-hut, #clan-announcements, #command-center, #war-log, etc.' },
                { name: '3. Create Roles', value: 'Leader, Co-Leader, Elder, Member, War General, etc.' },
                { name: '4. Set Up Bot', value: 'Use `/setclan` followed by `/roles setup type:clan_role` and `/roles setup type:th_level`' },
                { name: '5. Configure Channels', value: 'Set appropriate permissions for each channel based on roles' }
            )
            .setColor('#f1c40f')
            .setFooter({ text: 'Run this command again anytime you need setup help' });

        await interaction.reply({ embeds: [embed] });
    },
};