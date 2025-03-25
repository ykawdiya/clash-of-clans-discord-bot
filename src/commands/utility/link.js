const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const User = require('../../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Clash of Clans account to Discord')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Your player tag (e.g. #ABC123)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get player tag from options
            let playerTag = interaction.options.getString('tag');

            // Format the tag (add # if missing)
            if (!playerTag.startsWith('#')) {
                playerTag = `#${playerTag}`;
            }

            // Check if player exists
            let playerData;
            try {
                playerData = await clashApiService.getPlayer(playerTag);
            } catch (error) {
                if (error.response?.status === 404) {
                    return interaction.editReply('Player not found. Please check your tag and try again.');
                }
                throw error;
            }

            // Check if this tag is already linked to another user
            const existingUser = await User.findOne({ playerTag });
            if (existingUser && existingUser.discordId !== interaction.user.id) {
                return interaction.editReply('This player tag is already linked to another Discord user.');
            }

            // Create or update user document
            const user = await User.findOneAndUpdate(
                { discordId: interaction.user.id },
                {
                    discordId: interaction.user.id,
                    playerTag,
                    isVerified: true, // For now, we're auto-verifying. Could implement a verification process later
                    updatedAt: Date.now()
                },
                { upsert: true, new: true }
            );

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('Account Linked Successfully')
                .setDescription(`Your Discord account has been linked to the following Clash of Clans player:`)
                .addFields(
                    { name: 'Player Name', value: playerData.name, inline: true },
                    { name: 'Player Tag', value: playerData.tag, inline: true },
                    { name: 'Town Hall', value: `Level ${playerData.townHallLevel}`, inline: true }
                )
                .setFooter({ text: 'You can now use player commands without specifying your tag', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error in link command:', error);
            return interaction.editReply('An error occurred while linking your account. Please try again later.');
        }
    },
};