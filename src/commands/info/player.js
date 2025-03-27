const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const User = require('../../models/User');

const fetchWithTimeout = async (promise, timeout = 5000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('player')
        .setDescription('Look up a Clash of Clans player by tag')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Player tag (e.g. #ABC123)')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Discord user to look up (if they have linked their account)')
                .setRequired(false)),

    manualDeferring: true,

    async execute(interaction) {
        await interaction.deferReply();

        try {
            let playerTag;

            // Check if user option is provided
            const targetUser = interaction.options.getUser('user');
            if (targetUser) {
                // Look up the user in the database
                const userDoc = await User.findOne({ discordId: targetUser.id });

                if (!userDoc || !userDoc.playerTag) {
                    return interaction.editReply(`${targetUser.username} has not linked their Clash of Clans account.`);
                }

                playerTag = userDoc.playerTag;
            } else {
                // Check if tag option is provided
                playerTag = interaction.options.getString('tag');

                // If no tag provided, try to find the caller's linked account
                if (!playerTag) {
                    const userDoc = await User.findOne({ discordId: interaction.user.id });

                    if (!userDoc || !userDoc.playerTag) {
                        return interaction.editReply("Please provide a player tag or link your account using `/link` command.");
                    }

                    playerTag = userDoc.playerTag;
                }
            }

            console.log(`[PLAYER] User ${interaction.user.id} requested player info for ${playerTag}`);

            // Remove # if provided and add it if not
            playerTag = playerTag.replace(/^#/, '');

            // Fetch player data from CoC API
            const playerData = await fetchWithTimeout(clashApiService.getPlayer(playerTag));

            // Create embed with player information
            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle(`${playerData.name} (${playerData.tag})`)
                .setThumbnail('https://cdn.pixabay.com/photo/2016/08/26/09/19/clash-of-clans-1621176_960_720.jpg')
                .addFields(
                    { name: 'Town Hall', value: `Level ${playerData.townHallLevel}`, inline: true },
                    { name: 'Experience', value: `Level ${playerData.expLevel}`, inline: true },
                    { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
                    { name: 'Best Trophies', value: playerData.bestTrophies.toString(), inline: true },
                    { name: 'War Stars', value: playerData.warStars.toString(), inline: true },
                    { name: 'Attack Wins', value: playerData.attackWins.toString(), inline: true },
                )
                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Add clan information if player is in a clan
            if (playerData.clan) {
                embed.addFields(
                    { name: 'Clan', value: `[${playerData.clan.name}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(playerData.clan.tag)})`, inline: true },
                    { name: 'Clan Role', value: playerData.role || 'Member', inline: true }
                );
            } else {
                embed.addFields({ name: 'Clan', value: 'No Clan', inline: true });
            }

            // Add heroes if any
            if (playerData.heroes && playerData.heroes.length > 0) {
                const heroesText = playerData.heroes
                    .map(hero => `${hero.name}: Level ${hero.level}/${hero.maxLevel}`)
                    .join('\n');

                embed.addFields({ name: 'Heroes', value: heroesText });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in player command:', error);

            if (error.response?.status === 404) {
                return interaction.editReply('Player not found. Please check the tag and try again.');
            }

            return interaction.editReply('An error occurred while fetching player data. Please try again later.');
        }
    },
};