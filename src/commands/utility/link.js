const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const User = require('../../models/User');
const { validateTag } = require('../../utils/validators'); // Import the tag validator

// Add this at the top of the file
const { getModel } = require('../../models/modelRegistry');

// Then, instead of:
// const Base = mongoose.model('Base', baseSchema);

// Use:
const Base = getModel('Base', baseSchema);

const fetchWithTimeout = async (promise, timeout = 5000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
};

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

            // Validate tag format using the validator utility
            const validation = validateTag(playerTag);
            if (!validation.valid) {
                return interaction.editReply(validation.message);
            }

            playerTag = validation.formattedTag;

            // Check if player exists
            let playerData;
            try {
                playerData = await fetchWithTimeout(clashApiService.getPlayer(playerTag));
            } catch (error) {
                if (error.message === 'Request timed out') {
                    return interaction.editReply('Clash of Clans API is taking too long. Please try again later.');
                }
                if (error.response?.status === 404) {
                    return interaction.editReply('Player not found. Please check your tag and try again.');
                }
                console.error('Error fetching player data:', error);
                return interaction.editReply('An error occurred while checking your player tag. Please try again later.');
            }

            // Log the user who is linking their Clash of Clans account
            console.log(`User ${interaction.user.id} linked to ${playerTag}`);

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