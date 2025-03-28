const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('war')
        .setDescription('Get current war information for a clan')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false)),

    category: 'Info',
    longDescription: 'Shows detailed information about a clan\'s current war, including opponent, war status, attack stats, and remaining attacks. If no tag is provided, it uses the clan linked to this Discord server.',
    examples: ['/war', '/war tag:#ABC123'],
    manualDeferring: true,

    async execute(interaction) {
        // Immediately defer reply to prevent timeout
        await interaction.deferReply().catch(() => {});

        try {
            // Get and validate clan tag
            let clanTag = await getClanTag(interaction);
            if (!clanTag) return;

            // Fetch war data
            const warData = await clashApiService.getCurrentWar(clanTag);

            // Check if clan is in war
            if (!warData || warData.state === 'notInWar') {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Not in War")
                            .setColor(0x3498db)
                            .setDescription("This clan is not currently participating in a war.")
                            .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                    ]
                });
            }

            // Fetch clan data for additional info like badge
            let clanData;
            try {
                clanData = await clashApiService.getClan(clanTag);
            } catch (error) {
                // Continue even if clan data fetch fails
                console.log("Could not fetch clan data, continuing with war data only");
            }

            // Generate and send war embed
            const warEmbed = generateWarEmbed(warData, clanData);
            return interaction.editReply({ embeds: [warEmbed] });

        } catch (error) {
            console.error('Error in war command:', error);

            // Handle specific error cases
            if (error.message?.includes('403')) {
                return handleAccessDeniedError(interaction, error);
            } else if (error.message?.includes('404')) {
                return interaction.editReply("Clan not found. Please check the tag and try again.");
            } else if (error.message?.includes('timeout')) {
                return interaction.editReply("Request timed out. The Clash of Clans API might be experiencing issues.");
            }

            // Default error message
            return interaction.editReply("Error fetching war data. Please try again later.");
        }
    },
};

/**
 * Get and validate clan tag from options or database
 */
async function getClanTag(interaction) {
    // Check if tag option is provided
    let clanTag = interaction.options.getString('tag');

    // If no tag provided, check for linked clan
    if (!clanTag) {
        try {
            // Use Promise.race to prevent hanging on database query
            const linkedClan = await Promise.race([
                Clan.findOne({ guildId: interaction.guild.id }),
                new Promise((_, reject) => setTimeout(() =>
                    reject(new Error('Database query timed out')), 2000))
            ]);

            if (!linkedClan) {
                await interaction.editReply("Please provide a clan tag or link a clan to this server using `/setclan` command.");
                return null;
            }

            clanTag = linkedClan.clanTag;

            // Add # prefix if missing
            if (!clanTag.startsWith('#')) {
                clanTag = '#' + clanTag;
            }
        } catch (error) {
            console.error('Database error when finding linked clan:', error);
            await interaction.editReply("Error retrieving the server's linked clan. Please provide a clan tag directly.");
            return null;
        }
    }

    // Validate tag format
    const validation = validateTag(clanTag);
    if (!validation.valid) {
        await interaction.editReply(validation.message);
        return null;
    }

    return validation.formattedTag;
}

/**
 * Generate war embed with proper formatting
 */
function generateWarEmbed(warData, clanData) {
    // Safely extract data with defaults
    const clan = warData.clan || {};
    const opponent = warData.opponent || {};

    // Calculate war size and attacks
    const warSize = warData.teamSize || clan.members?.length || 0;

    // Set color and status based on war state
    let color, status;
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

    // Count attacks
    let clanAttacks = 0, opponentAttacks = 0;

    // Count from members if available
    if (Array.isArray(clan.members)) {
        for (const member of clan.members) {
            clanAttacks += member.attacks?.length || 0;
        }
    }

    if (Array.isArray(opponent.members)) {
        for (const member of opponent.members) {
            opponentAttacks += member.attacks?.length || 0;
        }
    }

    // Calculate remaining attacks
    const totalPossibleAttacks = warSize * 2;
    const clanAttacksRemaining = totalPossibleAttacks - clanAttacks;
    const opponentAttacksRemaining = totalPossibleAttacks - opponentAttacks;

    // Format times
    let timeInfo = '';
    if (warData.state === 'preparation' && warData.startTime) {
        const startTime = new Date(warData.startTime);
        if (!isNaN(startTime.getTime())) {
            const now = new Date();
            const hoursRemaining = Math.floor((startTime - now) / (1000 * 60 * 60));
            const minutesRemaining = Math.floor(((startTime - now) % (1000 * 60 * 60)) / (1000 * 60));
            timeInfo = `Preparation ends in ${hoursRemaining}h ${minutesRemaining}m`;
        }
    } else if (warData.state === 'inWar' && warData.endTime) {
        const endTime = new Date(warData.endTime);
        if (!isNaN(endTime.getTime())) {
            const now = new Date();
            const hoursRemaining = Math.floor((endTime - now) / (1000 * 60 * 60));
            const minutesRemaining = Math.floor(((endTime - now) % (1000 * 60 * 60)) / (1000 * 60));
            timeInfo = `War ends in ${hoursRemaining}h ${minutesRemaining}m`;
        }
    }

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(`${clan.name || 'Our Clan'} vs ${opponent.name || 'Enemy Clan'}`)
        .setColor(color)
        .setDescription(`**Status:** ${status}${timeInfo ? `\n**${timeInfo}**` : ''}`)
        .addFields(
            {
                name: clan.name || 'Our Clan',
                value: `⭐ Stars: ${clan.stars || 0}\n💥 Destruction: ${(clan.destructionPercentage || 0).toFixed(1)}%\n🗡️ Attacks: ${clanAttacks}/${totalPossibleAttacks}`,
                inline: true
            },
            {
                name: opponent.name || 'Enemy Clan',
                value: `⭐ Stars: ${opponent.stars || 0}\n💥 Destruction: ${(opponent.destructionPercentage || 0).toFixed(1)}%\n🗡️ Attacks: ${opponentAttacks}/${totalPossibleAttacks}`,
                inline: true
            }
        )
        .setFooter({ text: 'Clash of Clans Bot' })
        .setTimestamp();

    // Add thumbnail if available
    if (clanData?.badgeUrls?.medium) {
        embed.setThumbnail(clanData.badgeUrls.medium);
    }

    // Add war size
    embed.addFields({
        name: 'War Size',
        value: `${warSize}v${warSize}`,
        inline: false
    });

    // Add attacks remaining if in war
    if (warData.state === 'inWar') {
        embed.addFields({
            name: 'Attacks Remaining',
            value: `${clan.name || 'Our Clan'}: ${clanAttacksRemaining}\n${opponent.name || 'Enemy Clan'}: ${opponentAttacksRemaining}`,
            inline: false
        });
    }

    // Add war result if ended
    if (warData.state === 'warEnded') {
        const clanStars = clan.stars || 0;
        const opponentStars = opponent.stars || 0;
        const clanDestruction = clan.destructionPercentage || 0;
        const opponentDestruction = opponent.destructionPercentage || 0;

        let result;
        if (clanStars > opponentStars) {
            result = `${clan.name || 'Our Clan'} Won! 🏆`;
        } else if (clanStars < opponentStars) {
            result = `${opponent.name || 'Enemy Clan'} Won! 😓`;
        } else if (clanDestruction > opponentDestruction) {
            result = `${clan.name || 'Our Clan'} Won by destruction percentage! 🏆`;
        } else if (clanDestruction < opponentDestruction) {
            result = `${opponent.name || 'Enemy Clan'} Won by destruction percentage! 😓`;
        } else {
            result = "It's a Perfect Tie! 🤝";
        }

        embed.addFields({ name: 'War Result', value: result, inline: false });
    }

    return embed;
}

/**
 * Handle API access denied errors
 */
function handleAccessDeniedError(interaction, error) {
    // Check if this is a private war log issue
    const errorMessage = error.response?.data?.message || error.message || '';

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
                    .setFooter({ text: 'Clash of Clans Bot' })
            ]
        });
    } else {
        // General API access issue
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
                    .setFooter({ text: 'Clash of Clans Bot' })
            ]
        });
    }
}