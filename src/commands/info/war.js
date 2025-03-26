const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('war')
        .setDescription('Get current war information for a clan')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false)),

    /**
     * Command category for organization
     */
    category: 'Info',

    /**
     * Full help description for the help command
     */
    longDescription: 'Shows detailed information about a clan\'s current war, including opponent, war status, attack stats, and remaining attacks. If no tag is provided, it uses the clan linked to this Discord server.',

    /**
     * Usage examples
     */
    examples: [
        '/war',
        '/war tag:#ABC123'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Check if tag option is provided
            let clanTag = interaction.options.getString('tag');

            console.log(`War command called for clan tag: ${clanTag || 'None provided (using server default)'}`);

            // If no tag provided, check if server has a linked clan
            if (!clanTag) {
                console.log(`No tag provided, looking up linked clan for guild: ${interaction.guild.id}`);
                try {
                    const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

                    console.log(`Database query result:`, linkedClan ?
                        {
                            found: true,
                            clanTag: linkedClan.clanTag,
                            name: linkedClan.name
                        } :
                        {found: false}
                    );

                    if (!linkedClan) {
                        return interaction.editReply("Please provide a clan tag or link a clan to this server using `/setclan` command.");
                    }

                    clanTag = linkedClan.clanTag;
                    console.log(`Using linked clan tag: ${clanTag}`);

                    // Make sure the tag has # prefix
                    if (!clanTag.startsWith('#')) {
                        clanTag = '#' + clanTag;
                        console.log(`Added # to clan tag: ${clanTag}`);
                    }

                    // Validate the tag format
                    const validation = validateTag(clanTag);
                    if (!validation.valid) {
                        console.error(`Invalid clan tag format in database: ${clanTag}`);
                        return interaction.editReply(`The clan tag stored for this server is invalid: ${validation.message}`);
                    }

                    // Use the formatted tag
                    clanTag = validation.formattedTag;
                    console.log(`Using formatted clan tag: ${clanTag}`);
                } catch (dbError) {
                    console.error('Database error when finding linked clan:', dbError);
                    return interaction.editReply("Error retrieving the server's linked clan. Please provide a clan tag directly or try again later.");
                }
            } else {
                // Validate the provided tag
                const validation = validateTag(clanTag);
                if (!validation.valid) {
                    return interaction.editReply(validation.message);
                }
                clanTag = validation.formattedTag;
            }

            // Get current war data
            console.log(`Fetching war data for clan: ${clanTag}`);
            const warData = await clashApiService.getCurrentWar(clanTag);

            // Check if war data is valid
            if (!warData) {
                return interaction.editReply("Could not retrieve war data. The clan might not be in a war or there might be an API issue.");
            }

            console.log(`War state: ${warData.state || 'unknown'}`);

            // Get clan data for clan names and badges
            console.log(`Fetching clan data for: ${clanTag}`);
            const clanData = await clashApiService.getClan(clanTag);

            // Process war data
            return await processWarData(interaction, warData, clanData);
        }
        catch (error) {
            console.error('Error in war command:', error);

            // Log more detailed info about the error
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                response: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : null
            });

            // Check for specific error types
            if (error.response && error.response.status === 404) {
                return interaction.editReply("Clan not found. Please check the tag and try again.");
            } else if (error.response && error.response.status === 403) {
                return interaction.editReply("API access denied. Please check your API key and IP whitelist settings.");
            } else if (error.message && error.message.includes('timeout')) {
                return interaction.editReply("Request timed out. The Clash of Clans API might be experiencing issues.");
            }

            // Return a more informative error to the user
            return interaction.editReply(
                `Error fetching war data: ${error.message}. ` +
                `Please check if the clan tag is correct and the clan is in an active war.`
            );
        }
    },
};

/**
 * Process and display war data
 * @param {CommandInteraction} interaction
 * @param {Object} warData
 * @param {Object} clanData
 */
async function processWarData(interaction, warData, clanData) {
    try {
        // Check war state
        if (!warData || warData.state === 'notInWar') {
            const embed = new EmbedBuilder()
                .setTitle(`${clanData?.name || 'This clan'} is not currently in a war`)
                .setColor('#3498db')
                .setThumbnail(clanData?.badgeUrls?.medium || null)
                .setDescription('The clan is not participating in a clan war right now.')
                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // If in war, process the data with safe fallbacks
        const clan = warData.clan || {};
        const opponent = warData.opponent || {};

        // Check if essential data is available
        if (!clan.name || !opponent.name) {
            console.error('Missing essential war data:', { clan, opponent });
            return interaction.editReply("Invalid war data received. The clan might be in an unusual war state.");
        }

        // Safely get members count (ensure it's a number)
        let clanMembers = 0;
        if (typeof clan.members === 'number') {
            clanMembers = clan.members;
        } else if (clan.members && Array.isArray(clan.members)) {
            clanMembers = clan.members.length;
        } else if (warData.teamSize) {
            clanMembers = warData.teamSize;
        }

        let opponentMembers = 0;
        if (typeof opponent.members === 'number') {
            opponentMembers = opponent.members;
        } else if (opponent.members && Array.isArray(opponent.members)) {
            opponentMembers = opponent.members.length;
        } else if (warData.teamSize) {
            opponentMembers = warData.teamSize;
        }

        // Safely calculate attacks
        const clanTotalAttacks = clanMembers * 2;
        const opponentTotalAttacks = opponentMembers * 2;

        // Count actual attacks if available
        let clanAttacks = 0;
        if (typeof clan.attacks === 'number') {
            clanAttacks = clan.attacks;
        } else if (clan.attacks && Array.isArray(clan.attacks)) {
            clanAttacks = clan.attacks.length;
        } else if (Array.isArray(clan.members)) {
            // Count attacks from members if available
            clanAttacks = clan.members.reduce((total, member) => {
                return total + (Array.isArray(member.attacks) ? member.attacks.length : 0);
            }, 0);
        }

        let opponentAttacks = 0;
        if (typeof opponent.attacks === 'number') {
            opponentAttacks = opponent.attacks;
        } else if (opponent.attacks && Array.isArray(opponent.attacks)) {
            opponentAttacks = opponent.attacks.length;
        } else if (Array.isArray(opponent.members)) {
            // Count attacks from members if available
            opponentAttacks = opponent.members.reduce((total, member) => {
                return total + (Array.isArray(member.attacks) ? member.attacks.length : 0);
            }, 0);
        }

        // Determine war status and color
        let status, color;
        switch (warData.state) {
            case 'preparation':
                status = 'Preparation Day';
                color = '#f1c40f'; // Yellow
                break;
            case 'inWar':
                status = 'Battle Day';
                color = '#e67e22'; // Orange
                break;
            case 'warEnded':
                status = 'War Ended';
                color = '#2ecc71'; // Green
                break;
            default:
                status = warData.state || 'Unknown';
                color = '#3498db'; // Blue
        }

        // Calculate time remaining if applicable
        let timeRemaining = '';
        if (warData.state === 'preparation' && warData.startTime) {
            try {
                const endTime = new Date(warData.startTime);
                if (!isNaN(endTime.getTime())) { // Ensure valid date
                    timeRemaining = formatTimeRemaining(endTime);
                }
            } catch (e) {
                console.error('Error parsing preparation end time:', e);
            }
        } else if (warData.state === 'inWar' && warData.endTime) {
            try {
                const endTime = new Date(warData.endTime);
                if (!isNaN(endTime.getTime())) { // Ensure valid date
                    timeRemaining = formatTimeRemaining(endTime);
                }
            } catch (e) {
                console.error('Error parsing war end time:', e);
            }
        }

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`${clan.name} vs ${opponent.name}`)
            .setColor(color)
            .setDescription(`**Status:** ${status}${timeRemaining ? `\n**Time Remaining:** ${timeRemaining}` : ''}`)
            .addFields(
                {
                    name: clan.name,
                    value: `Level: ${clan.clanLevel || '?'}\nAttacks: ${clanAttacks}/${clanTotalAttacks}\nStars: ${clan.stars || 0}\nDestruction: ${((clan.destructionPercentage || 0).toFixed(2))}%`,
                    inline: true
                },
                {
                    name: opponent.name,
                    value: `Level: ${opponent.clanLevel || '?'}\nAttacks: ${opponentAttacks}/${opponentTotalAttacks}\nStars: ${opponent.stars || 0}\nDestruction: ${((opponent.destructionPercentage || 0).toFixed(2))}%`,
                    inline: true
                }
            )
            .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        // Add thumbnail if available
        if (clanData?.badgeUrls?.medium) {
            embed.setThumbnail(clanData.badgeUrls.medium);
        }

        // Add team size
        embed.addFields({
            name: 'War Size',
            value: `${clanMembers}v${opponentMembers}`,
            inline: false
        });

        // Add attacks remaining if in war
        if (warData.state === 'inWar') {
            const clanAttacksRemaining = clanTotalAttacks - clanAttacks;
            const opponentAttacksRemaining = opponentTotalAttacks - opponentAttacks;

            embed.addFields({
                name: 'Attacks Remaining',
                value: `${clan.name}: ${clanAttacksRemaining}\n${opponent.name}: ${opponentAttacksRemaining}`,
                inline: false
            });
        }

        // Add war result if ended
        if (warData.state === 'warEnded') {
            let result;
            const clanStars = clan.stars || 0;
            const opponentStars = opponent.stars || 0;
            const clanDestruction = clan.destructionPercentage || 0;
            const opponentDestruction = opponent.destructionPercentage || 0;

            if (clanStars > opponentStars) {
                result = `${clan.name} Won! 🏆`;
            } else if (clanStars < opponentStars) {
                result = `${opponent.name} Won! 😓`;
            } else {
                // If stars are equal, compare destruction percentage
                if (clanDestruction > opponentDestruction) {
                    result = `${clan.name} Won! 🏆 (by destruction percentage)`;
                } else if (clanDestruction < opponentDestruction) {
                    result = `${opponent.name} Won! 😓 (by destruction percentage)`;
                } else {
                    result = "It's a Perfect Tie! 🤝";
                }
            }

            embed.addFields({ name: 'War Result', value: result, inline: false });
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in processWarData:', error);
        return interaction.editReply("An error occurred while processing war data. Please try again later.");
    }
}

/**
 * Format time remaining until a date
 * @param {Date} endTime
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(endTime) {
    const now = new Date();
    const diff = endTime - now;

    // Handle cases where the end time has already passed
    if (diff <= 0) {
        return 'Ended';
    }

    // Calculate hours and minutes
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
}

if (error.response && error.response.status === 403) {
    console.error('API access denied. Full error:', error);
    console.error('Request URL:', error.config?.url);
    console.error('Clan tag being used:', clanTag);
    return interaction.editReply(
        "API access denied. This usually means your server's IP address isn't whitelisted in the Clash of Clans API. " +
        "If this only happens with the linked clan, try using the clan tag directly: `/war tag:" + clanTag + "`"
    );
}