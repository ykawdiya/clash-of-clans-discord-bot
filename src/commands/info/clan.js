const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Look up a Clash of Clans clan by tag')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Search for a clan by name')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Check if tag option is provided
            const clanTag = interaction.options.getString('tag');
            const clanName = interaction.options.getString('name');

            // If neither tag nor name provided, check if server has a linked clan
            if (!clanTag && !clanName) {
                const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

                if (!linkedClan) {
                    return interaction.editReply("Please provide a clan tag or name, or link a clan to this server using `/setclan` command.");
                }

                // Use the linked clan's tag
                const clanData = await clashApiService.getClan(linkedClan.clanTag);
                return sendClanEmbed(interaction, clanData);
            }

            // If tag is provided, look up by tag
            if (clanTag) {
                const formattedTag = clanTag.startsWith('#') ? clanTag : `#${clanTag}`;
                const clanData = await clashApiService.getClan(formattedTag);
                return sendClanEmbed(interaction, clanData);
            }

            // If name is provided, search for clans
            if (clanName) {
                const searchResults = await clashApiService.searchClans({ name: clanName, limit: 5 });

                if (!searchResults.items || searchResults.items.length === 0) {
                    return interaction.editReply(`No clans found matching "${clanName}". Try a different name or use a clan tag instead.`);
                }

                // If only one result, show that clan
                if (searchResults.items.length === 1) {
                    const clanData = await clashApiService.getClan(searchResults.items[0].tag);
                    return sendClanEmbed(interaction, clanData);
                }

                // If multiple results, show a list
                const embed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle(`Clans matching "${clanName}"`)
                    .setDescription('Use `/clan tag:#TAG` to view detailed information about a specific clan.')
                    .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                // Add each clan to the embed
                searchResults.items.forEach((clan, index) => {
                    embed.addFields({
                        name: `${index + 1}. ${clan.name} (${clan.tag})`,
                        value: `👥 ${clan.members}/50 | 🏆 ${clan.clanPoints} | Location: ${clan.location?.name || 'Not set'}`
                    });
                });

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in clan command:', error);

            // Create a user-friendly error message based on the error
            let errorMessage = 'An error occurred while fetching clan data.';

            if (error.response) {
                // API returned an error response
                if (error.response.status === 404) {
                    errorMessage = 'Clan not found. Please check the tag and try again.';
                } else if (error.response.status === 403) {
                    errorMessage = 'API access denied. The bot\'s IP address is not whitelisted in the Clash of Clans API.';
                } else if (error.response.status === 401) {
                    errorMessage = 'API authentication failed. Please check the API key configuration.';
                } else if (error.response.status === 429) {
                    errorMessage = 'Too many requests to the Clash of Clans API. Please try again later.';
                } else {
                    errorMessage = `API error: ${error.response.status} - Please try again later.`;
                }
            } else if (error.request) {
                // No response received
                errorMessage = 'No response received from the Clash of Clans API. The service might be down.';
            } else if (error.message && error.message.includes('API key is not configured')) {
                errorMessage = 'The Clash of Clans API key is not properly configured.';
            } else if (error.message && error.message.includes('IP whitelisting issue')) {
                errorMessage = 'API access denied. The bot server\'s IP needs to be whitelisted in the CoC developer portal.';
            }

            // Add debugging information for admins
            console.error('Detailed error:', error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            }

            return interaction.editReply(errorMessage);
        }
    },
};

/**
 * Send clan information as an embed
 * @param {Interaction} interaction
 * @param {Object} clanData
 */
async function sendClanEmbed(interaction, clanData) {
    // Convert clan level to emojis (just for fun)
    const levelStars = '⭐'.repeat(Math.min(clanData.clanLevel, 10));

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${clanData.name} (${clanData.tag})`)
        .setDescription(clanData.description || 'No description')
        .setThumbnail(clanData.badgeUrls.medium)
        .addFields(
            { name: 'Level', value: `${clanData.clanLevel} ${levelStars}`, inline: true },
            { name: 'Members', value: `${clanData.members}/50`, inline: true },
            { name: 'Clan Points', value: clanData.clanPoints.toString(), inline: true },
            { name: 'War League', value: clanData.warLeague?.name || 'None', inline: true },
            { name: 'Location', value: clanData.location?.name || 'International', inline: true },
            { name: 'War Frequency', value: capitalize(clanData.warFrequency) || 'Unknown', inline: true },
            { name: 'War Win Streak', value: clanData.warWinStreak.toString(), inline: true },
            { name: 'War Wins', value: clanData.warWins.toString(), inline: true },
            { name: 'War Losses', value: (clanData.warLosses || 'N/A').toString(), inline: true },
        )
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add requirements
    const requirementsText = [
        `🏠 Required TH: ${clanData.requiredTownhallLevel || 'Any'}`,
        `🏆 Required Trophies: ${clanData.requiredTrophies}`,
        `🔞 Type: ${clanData.type === 'open' ? 'Open' : clanData.type === 'inviteOnly' ? 'Invite Only' : 'Closed'}`
    ].join('\n');

    embed.addFields({ name: 'Requirements', value: requirementsText });

    // Add clan capital info if available
    if (clanData.clanCapital && clanData.clanCapital.capitalHallLevel > 0) {
        embed.addFields({
            name: 'Clan Capital',
            value: `Capital Hall: Level ${clanData.clanCapital.capitalHallLevel}\nDistricts: ${clanData.clanCapital.districts?.length || 0}\nTotal Capital Points: ${clanData.clanCapital.capitalPoints || 0}`
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Capitalize the first letter of each word in a string
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
    if (!str) return '';
    return str
        .split(/(?=[A-Z])|\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}