const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

// Use a shorter timeout for fetching data to avoid Discord timeouts
const fetchWithTimeout = async (promise, timeout = 2000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
};

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

    // Flag to indicate this command handles its own deferring
    manualDeferring: true,

    async execute(interaction) {
        // IMMEDIATELY defer reply to prevent timeout
        await interaction.deferReply().catch(err => {
            console.error('Failed to defer reply:', err);
            // We should still continue the execution even if deferring fails
        });

        try {
            // Check if tag option is provided
            let clanTag = interaction.options.getString('tag');

            console.log(`War command called for clan tag: ${clanTag || 'None provided (using server default)'}`);

            // If no tag provided, check if server has a linked clan
            if (!clanTag) {
                console.log(`No tag provided, looking up linked clan for guild: ${interaction.guild.id}`);
                try {
                    // Use timeout for database query to prevent hanging
                    const linkedClan = await Promise.race([
                        Clan.findOne({ guildId: interaction.guild.id }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timed out')), 2000))
                    ]);

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

            // Get current war data with shorter timeout
            console.log(`[WAR] User ${interaction.user.id} requested war info for ${clanTag}`);
            console.log(`Fetching war data for clan: ${clanTag}`);
            try {
                // Use shorter timeout for API calls
                const warData = await fetchWithTimeout(clashApiService.getCurrentWar(clanTag), 2000);

                // Check if war data is valid
                if (!warData) {
                    return interaction.editReply("Could not retrieve war data. The clan might not be in a war or there might be an API issue.");
                }

                console.log(`War state: ${warData.state || 'unknown'}`);

                // Get clan data for clan names and badges with shorter timeout
                console.log(`Fetching clan data for: ${clanTag}`);
                const clanData = await fetchWithTimeout(clashApiService.getClan(clanTag), 2000);

                // Process war data
                return await processWarData(interaction, warData, clanData);
            } catch (apiError) {
                // Special handling for API errors
                if (apiError.code === 'ACCESS_DENIED' || (apiError.response && apiError.response.status === 403)) {
                    console.error('API access denied error:', apiError);

                    // Check for IP whitelist issue in error message
                    let ipAddress = "your server's IP";
                    if (apiError.details && apiError.details.responseData && apiError.details.responseData.message) {
                        const ipMatch = apiError.details.responseData.message.match(/IP ([0-9.]+)/);
                        if (ipMatch && ipMatch[1]) {
                            ipAddress = ipMatch[1];
                        }
                    }

                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("⚠️ Clash of Clans API Access Denied")
                                .setColor(0xED4245)
                                .setDescription(`The Clash of Clans API rejected our request because ${ipAddress} is not whitelisted.`)
                                .addFields(
                                    {
                                        name: "How to Fix This",
                                        value: "1. Go to [developer.clashofclans.com](https://developer.clashofclans.com)\n" +
                                            "2. Log in and go to 'My Account'\n" +
                                            "3. Add IP address `" + ipAddress + "` to your whitelist\n" +
                                            "4. Wait a few minutes for changes to take effect"
                                    },
                                    {
                                        name: "Temporary Workaround",
                                        value: "While you wait for the whitelist to update, you can try using a different CoC API key that already has this IP whitelisted."
                                    }
                                )
                                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                                .setTimestamp()
                        ]
                    });
                }

                // Rethrow for general error handling below
                throw apiError;
            }
        }
            // Replace the catch block in your war.js file (around line 148-175)
// with this improved error handling

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
            if (error.response && error.response.status === 403) {
                // Check if this is a private war log issue
                const errorMessage = error.response.data?.message || '';
                if (errorMessage.includes('access') && errorMessage.includes('war')) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("⚠️ Private War Log")
                                .setColor(0xFFA500) // Orange color
                                .setDescription("This clan has their war log set to private.")
                                .addFields(
                                    {
                                        name: "Why this happens",
                                        value: "Clash of Clans allows clans to hide their war information from outside tools and websites."
                                    },
                                    {
                                        name: "How to fix",
                                        value: "Only the clan's leadership can change this setting in-game under clan settings."
                                    }
                                )
                                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                                .setTimestamp()
                        ]
                    });
                } else {
                    // This is likely an actual IP whitelist issue
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("⚠️ API Access Denied")
                                .setColor(0xED4245) // Red color
                                .setDescription("The Clash of Clans API rejected our request.")
                                .addFields(
                                    {
                                        name: "Possible Issues",
                                        value: "1. The bot's IP address is not whitelisted\n2. The API key is invalid or expired"
                                    }
                                )
                                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                                .setTimestamp()
                        ]
                    });
                }
            } else if (error.response && error.response.status === 404) {
                return interaction.editReply("Clan not found. Please check the tag and try again.");
            } else if (error.message && error.message.includes('timeout')) {
                return interaction.editReply("Request timed out. The Clash of Clans API might be experiencing issues.");
            } else if (error.message && error.message.includes('notInWar')) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Not in War")
                            .setColor(0x3498db) // Blue color
                            .setDescription("This clan is not currently participating in a war.")
                            .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                            .setTimestamp()
                    ]
                });
            }

            // Default error message
            return interaction.editReply(
                "Error fetching war data. Please check if the clan tag is correct and try again later."
            );
        }
    },
};

/**
 * Process and display war data - simplified to be faster
 * @param {CommandInteraction} interaction
 * @param {Object} warData
 * @param {Object} clanData
 */
async function processWarData(interaction, warData, clanData) {
    try {
        // Check war state - handle simplest case first
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

        // Safer, faster calculation of member counts
        const clanMembers = warData.teamSize || (clan.members?.length || 0);
        const opponentMembers = warData.teamSize || (opponent.members?.length || 0);

        // Faster calculation of attacks
        let clanAttacks = 0;
        let opponentAttacks = 0;

        if (Array.isArray(clan.attacks)) {
            clanAttacks = clan.attacks.length;
        } else if (Array.isArray(clan.members)) {
            // Count attacks from members
            for (const member of clan.members) {
                if (Array.isArray(member.attacks)) {
                    clanAttacks += member.attacks.length;
                }
            }
        }

        if (Array.isArray(opponent.attacks)) {
            opponentAttacks = opponent.attacks.length;
        } else if (Array.isArray(opponent.members)) {
            // Count attacks from members
            for (const member of opponent.members) {
                if (Array.isArray(member.attacks)) {
                    opponentAttacks += member.attacks.length;
                }
            }
        }

        // Total possible attacks
        const clanTotalAttacks = clanMembers * 2;
        const opponentTotalAttacks = opponentMembers * 2;

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
                // Just skip if error
            }
        } else if (warData.state === 'inWar' && warData.endTime) {
            try {
                const endTime = new Date(warData.endTime);
                if (!isNaN(endTime.getTime())) { // Ensure valid date
                    timeRemaining = formatTimeRemaining(endTime);
                }
            } catch (e) {
                // Just skip if error
            }
        }

        // Create a simpler embed with essential information
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

        // Add thumbnail if available (optional for speed)
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

        // Add war result if ended (more simplified calculation)
        if (warData.state === 'warEnded') {
            const clanStars = clan.stars || 0;
            const opponentStars = opponent.stars || 0;

            let result;
            if (clanStars > opponentStars) {
                result = `${clan.name} Won! 🏆`;
            } else if (clanStars < opponentStars) {
                result = `${opponent.name} Won! 😓`;
            } else {
                // If stars are equal, compare destruction percentage
                const clanDestruction = clan.destructionPercentage || 0;
                const opponentDestruction = opponent.destructionPercentage || 0;

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
 * Format time remaining until a date - simplified version for faster processing
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