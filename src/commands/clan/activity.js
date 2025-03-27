// src/commands/clan/activity.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const PlayerStats = require('../../models/PlayerStats');
const ErrorHandler = require('../../utils/errorHandler');

// Add this at the top of the file
const { getModel } = require('../../models/modelRegistry');

// Then, instead of:
// const Base = mongoose.model('Base', baseSchema);

// Use:
const Base = getModel('Base', baseSchema);
module.exports = {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Track and analyze clan member activity')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('Show clan activity overview'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('donations')
                .setDescription('Show donation statistics for clan members'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('inactive')
                .setDescription('Identify inactive members')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days to consider for inactivity (default: 7)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('member')
                .setDescription('Show detailed activity for a specific member')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag')
                        .setRequired(false))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Discord user (if linked)')
                        .setRequired(false))),

    category: 'Clan Management',

    longDescription: 'Track and analyze clan member activity across various aspects. Monitor clan-wide activity, donation statistics, identify inactive members, and check individual member contributions.',

    examples: [
        '/activity overview',
        '/activity donations',
        '/activity inactive days:14',
        '/activity member tag:#ABC123',
        '/activity member user:@discord_user'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            // Find linked clan for this Discord server
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan) {
                return interaction.editReply("This server doesn't have a linked clan. Use `/setclan` first.");
            }

            switch (subcommand) {
                case 'overview':
                    await showActivityOverview(interaction, linkedClan);
                    break;
                case 'donations':
                    await showDonationStats(interaction, linkedClan);
                    break;
                case 'inactive':
                    await showInactiveMembers(interaction, linkedClan);
                    break;
                case 'member':
                    await showMemberActivity(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in activity command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'activity command'));
        }
    },
};

/**
 * Show clan activity overview
 */
async function showActivityOverview(interaction, linkedClan) {
    // Get clan data
    const clanData = await clashApiService.getClan(linkedClan.clanTag);

    if (!clanData || !clanData.memberList) {
        return interaction.editReply('Could not retrieve clan data. Please try again later.');
    }

    // Calculate activity metrics
    const memberCount = clanData.memberList.length;
    const now = new Date();

    // Get all tracked player stats to determine player activity trends
    const allPlayerStats = await PlayerStats.find({
        playerTag: { $in: clanData.memberList.map(m => m.tag) }
    }).sort({ timestamp: -1 });

    // Group by player tag to get most recent stats for each player
    const playerStatsMap = {};
    for (const stats of allPlayerStats) {
        if (!playerStatsMap[stats.playerTag] || new Date(stats.timestamp) > new Date(playerStatsMap[stats.playerTag].timestamp)) {
            playerStatsMap[stats.playerTag] = stats;
        }
    }

    // Calculate donation statistics
    let totalDonations = 0;
    let totalReceived = 0;
    let donationRatio = 0;
    let activeDonators = 0;

    clanData.memberList.forEach(member => {
        totalDonations += member.donations || 0;
        totalReceived += member.donationsReceived || 0;

        if ((member.donations || 0) > 0) {
            activeDonators++;
        }
    });

    // Calculate ratio if possible
    if (totalReceived > 0) {
        donationRatio = totalDonations / totalReceived;
    }

    // Calculate war participation (if data available)
    let warParticipation = 'No data available';
    let warWinRate = 'No data available';

    if (clanData.warWins !== undefined && clanData.warLosses !== undefined) {
        const totalWars = (clanData.warWins || 0) + (clanData.warLosses || 0) + (clanData.warTies || 0);
        if (totalWars > 0) {
            warWinRate = `${((clanData.warWins / totalWars) * 100).toFixed(1)}%`;
        }
    }

    // Calculate activity trend based on player stats
    let activityTrend = calculateActivityTrend(clanData.memberList, playerStatsMap);

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${clanData.name} - Activity Overview`)
        .setThumbnail(clanData.badgeUrls?.medium)
        .setDescription(`Overall clan activity metrics and trends`)
        .addFields(
            { name: 'Members', value: `${memberCount}/50`, inline: true },
            { name: 'Active Donators', value: `${activeDonators}/${memberCount}`, inline: true },
            { name: 'War Win Rate', value: warWinRate, inline: true },
            { name: 'Donations (Total)', value: totalDonations.toLocaleString(), inline: true },
            { name: 'Donations Received', value: totalReceived.toLocaleString(), inline: true },
            { name: 'Donation Ratio', value: donationRatio.toFixed(2), inline: true }
        )
        .setFooter({ text: `Last Updated: ${now.toLocaleString()}` });

    // Add activity trend if available
    if (activityTrend) {
        embed.addFields({ name: 'Activity Trend', value: activityTrend.text, inline: false });
    }

    // Add town hall breakdown
    const thLevels = {};
    clanData.memberList.forEach(member => {
        const thLevel = member.townhallLevel || 0;
        thLevels[thLevel] = (thLevels[thLevel] || 0) + 1;
    });

    let thBreakdown = '';
    Object.keys(thLevels).sort((a, b) => b - a).forEach(thLevel => {
        thBreakdown += `TH${thLevel}: ${thLevels[thLevel]} members\n`;
    });

    embed.addFields({ name: 'Town Hall Breakdown', value: thBreakdown });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show donation statistics for clan members
 */
async function showDonationStats(interaction, linkedClan) {
    // Get clan data
    const clanData = await clashApiService.getClan(linkedClan.clanTag);

    if (!clanData || !clanData.memberList) {
        return interaction.editReply('Could not retrieve clan data. Please try again later.');
    }

    // Sort members by donations
    const sortedMembers = [...clanData.memberList].sort((a, b) => (b.donations || 0) - (a.donations || 0));

    // Calculate donation statistics
    const totalDonations = sortedMembers.reduce((total, member) => total + (member.donations || 0), 0);
    const totalReceived = sortedMembers.reduce((total, member) => total + (member.donationsReceived || 0), 0);
    const averageDonations = totalDonations / sortedMembers.length;

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(`${clanData.name} - Donation Statistics`)
        .setDescription(`Total Donations: **${totalDonations.toLocaleString()}**\nAverage per Member: **${Math.round(averageDonations).toLocaleString()}**`)
        .setFooter({ text: `Total Members: ${sortedMembers.length}` });

    // Add top donators list
    let topDonors = '';
    let count = 0;

    for (const member of sortedMembers) {
        if (count >= 10 || (member.donations || 0) === 0) break;

        const ratio = (member.donationsReceived || 0) > 0
            ? (member.donations / member.donationsReceived).toFixed(2)
            : '∞';

        topDonors += `${count + 1}. **${member.name}**: ${member.donations || 0} donated | ${member.donationsReceived || 0} received | Ratio: ${ratio}\n`;
        count++;
    }

    embed.addFields({ name: 'Top Donators', value: topDonors || 'No donations recorded' });

    // Add donation tier breakdown
    const donationTiers = [
        { name: '🏆 Legendary', min: 5000, count: 0 },
        { name: '🥇 Elite', min: 2000, count: 0 },
        { name: '🥈 Great', min: 1000, count: 0 },
        { name: '🥉 Good', min: 500, count: 0 },
        { name: '👍 Active', min: 100, count: 0 },
        { name: '😔 Low', min: 1, count: 0 },
        { name: '❌ None', min: 0, count: 0 }
    ];

    sortedMembers.forEach(member => {
        const donations = member.donations || 0;
        for (const tier of donationTiers) {
            if (donations >= tier.min) {
                tier.count++;
                break;
            }
        }
    });

    let tierBreakdown = '';
    donationTiers.forEach(tier => {
        tierBreakdown += `${tier.name}: ${tier.count} members\n`;
    });

    embed.addFields({ name: 'Donation Tiers', value: tierBreakdown });

    // Add info for members with request imbalance (low ratio)
    const requesters = [...sortedMembers]
        .filter(m => (m.donations || 0) > 0 && (m.donationsReceived || 0) > 0 && ((m.donations / m.donationsReceived) < 0.5))
        .sort((a, b) => (a.donations / a.donationsReceived) - (b.donations / b.donationsReceived))
        .slice(0, 5);

    if (requesters.length > 0) {
        let requestersText = '';
        requesters.forEach(member => {
            const ratio = (member.donations / member.donationsReceived).toFixed(2);
            requestersText += `**${member.name}**: ${member.donations || 0} donated | ${member.donationsReceived || 0} received | Ratio: ${ratio}\n`;
        });

        embed.addFields({ name: 'High Requesters (Low Ratio)', value: requestersText });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show inactive clan members
 */
async function showInactiveMembers(interaction, linkedClan) {
    const inactiveDays = interaction.options.getInteger('days') || 7;

    // Get clan data
    const clanData = await clashApiService.getClan(linkedClan.clanTag);

    if (!clanData || !clanData.memberList) {
        return interaction.editReply('Could not retrieve clan data. Please try again later.');
    }

    // Get all tracked player stats to determine inactivity
    const memberTags = clanData.memberList.map(m => m.tag);

    // Get the most recent player stats for each member
    const recentStats = await Promise.all(memberTags.map(async (tag) => {
        const stats = await PlayerStats.findOne({ playerTag: tag }).sort({ timestamp: -1 }).limit(1);
        return stats;
    }));

    // Analyze each member for potential inactivity
    const inactiveMembers = [];
    const now = new Date();

    for (const member of clanData.memberList) {
        let isInactive = false;
        let inactivityReason = [];

        // Check donations
        if ((member.donations || 0) < 100) {
            inactivityReason.push('Low donations');
        }

        // Check stats history
        const memberStats = recentStats.find(stats => stats && stats.playerTag === member.tag);

        if (memberStats) {
            const lastUpdate = new Date(memberStats.timestamp);
            const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

            if (daysSinceUpdate > inactiveDays) {
                isInactive = true;
                inactivityReason.push(`No activity for ${daysSinceUpdate} days`);
            }
        } else {
            inactivityReason.push('No tracked stats');
        }

        // Check trophies for potential inactivity
        const expectedMinTrophies = getTownHallMinTrophies(member.townhallLevel);
        if (member.trophies < expectedMinTrophies) {
            inactivityReason.push(`Low trophies (${member.trophies})`);
        }

        // Add to inactive members if matches criteria
        if (isInactive || inactivityReason.length >= 2) {
            inactiveMembers.push({
                name: member.name,
                tag: member.tag,
                townhallLevel: member.townhallLevel,
                role: member.role,
                trophies: member.trophies,
                donations: member.donations || 0,
                received: member.donationsReceived || 0,
                inactivityReason: inactivityReason.join(', ')
            });
        }
    }

    // Sort by inactivity reasons (more reasons = more likely inactive)
    inactiveMembers.sort((a, b) => b.inactivityReason.split(',').length - a.inactivityReason.split(',').length);

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`${clanData.name} - Inactive Members`)
        .setDescription(`Members showing signs of inactivity (${inactiveDays}+ days)\nTotal potential inactive: ${inactiveMembers.length}/${clanData.memberList.length}`)
        .setFooter({ text: 'Inactivity is determined by donations, trophies, and tracked stats' });

    // Add inactive members list
    if (inactiveMembers.length === 0) {
        embed.addFields({ name: 'No Inactive Members', value: 'All members appear to be active!' });
    } else {
        // Split into chunks if needed (Discord field value limit)
        const chunks = chunkArray(inactiveMembers, 10);

        chunks.forEach((chunk, index) => {
            let inactiveText = '';

            chunk.forEach(member => {
                const roleEmoji = getRoleEmoji(member.role);
                inactiveText += `${roleEmoji} **${member.name}** (TH${member.townhallLevel}) - ${member.inactivityReason}\n`;
            });

            embed.addFields({ name: `Inactive Members ${index + 1}`, value: inactiveText });
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show detailed activity for a specific member
 */
async function showMemberActivity(interaction, linkedClan) {
    // Determine which player to check
    let playerTag = interaction.options.getString('tag');
    const discordUser = interaction.options.getUser('user');

    // If neither provided, use the caller's linked account
    if (!playerTag && !discordUser) {
        const linkedUser = await User.findOne({ discordId: interaction.user.id });

        if (!linkedUser || !linkedUser.playerTag) {
            return interaction.editReply("Please provide a player tag, Discord user, or link your own account with `/link`.");
        }

        playerTag = linkedUser.playerTag;
    } else if (discordUser) {
        // Get the player tag from the linked Discord user
        const linkedUser = await User.findOne({ discordId: discordUser.id });

        if (!linkedUser || !linkedUser.playerTag) {
            return interaction.editReply(`${discordUser.username} has not linked their Clash of Clans account.`);
        }

        playerTag = linkedUser.playerTag;
    }

    // Format player tag if provided directly
    if (playerTag) {
        if (!playerTag.startsWith('#')) {
            playerTag = '#' + playerTag;
        }
        playerTag = playerTag.toUpperCase();
    }

    // Get player data
    const playerData = await clashApiService.getPlayer(playerTag);

    if (!playerData) {
        return interaction.editReply('Could not retrieve player data. Please check the tag and try again.');
    }

    // Get player stats history
    const playerStats = await PlayerStats.find({ playerTag: playerData.tag }).sort({ timestamp: -1 }).limit(5);

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`${playerData.name} - Activity Profile`)
        .setDescription(`Player Tag: ${playerData.tag}\nTown Hall: ${playerData.townhallLevel}\nClan: ${playerData.clan?.name || 'None'}`)
        .addFields(
            { name: 'Trophies', value: `${playerData.trophies} / ${playerData.bestTrophies} (best)`, inline: true },
            { name: 'War Stars', value: playerData.warStars.toString(), inline: true },
            { name: 'Experience', value: `Level ${playerData.expLevel}`, inline: true },
            { name: 'Donations', value: `Given: ${playerData.donations || 0}\nReceived: ${playerData.donationsReceived || 0}`, inline: true },
            { name: 'Attack Wins', value: (playerData.attackWins || 0).toString(), inline: true },
            { name: 'Defense Wins', value: (playerData.defenseWins || 0).toString(), inline: true }
        );

    // Add heroes if available
    if (playerData.heroes && playerData.heroes.length > 0) {
        const heroesText = playerData.heroes.map(hero =>
            `${hero.name}: Level ${hero.level}/${hero.maxLevel}`
        ).join('\n');

        embed.addFields({ name: 'Heroes', value: heroesText });
    }

    // Add stats history if available
    if (playerStats && playerStats.length > 0) {
        const mostRecent = playerStats[0];
        const oldestInSample = playerStats[playerStats.length - 1];

        if (mostRecent && oldestInSample) {
            const daysBetween = Math.round((new Date(mostRecent.timestamp) - new Date(oldestInSample.timestamp)) / (1000 * 60 * 60 * 24));

            if (daysBetween > 0) {
                const trophyChange = playerData.trophies - oldestInSample.trophies;
                const warStarChange = playerData.warStars - oldestInSample.warStars;

                let progressText = `Over the last ${daysBetween} days:\n`;
                progressText += `Trophies: ${trophyChange > 0 ? '+' : ''}${trophyChange}\n`;
                progressText += `War Stars: ${warStarChange > 0 ? '+' : ''}${warStarChange}\n`;

                // Add town hall change if applicable
                if (playerData.townhallLevel !== oldestInSample.townHallLevel) {
                    progressText += `Town Hall: ${oldestInSample.townHallLevel} → ${playerData.townhallLevel}\n`;
                }

                embed.addFields({ name: 'Recent Progress', value: progressText });
            }
        }

        // Add last seen
        const lastSeen = new Date(mostRecent.timestamp);
        const daysSinceLastSeen = Math.round((new Date() - lastSeen) / (1000 * 60 * 60 * 24));

        embed.addFields({ name: 'Last Tracked', value: `${lastSeen.toLocaleDateString()} (${daysSinceLastSeen} days ago)` });
    }

    // Add activity rating
    const activityRating = calculateActivityRating(playerData, playerStats);
    embed.addFields({ name: 'Activity Rating', value: activityRating.text });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Calculate activity trend for the clan
 */
function calculateActivityTrend(members, playerStatsMap) {
    // Count active vs inactive members
    let activeCount = 0;
    let inactiveCount = 0;
    let unknownCount = 0;

    members.forEach(member => {
        const stats = playerStatsMap[member.tag];

        // Check donations as primary activity indicator
        if ((member.donations || 0) > 200) {
            activeCount++;
        } else if ((member.donations || 0) < 50) {
            // Check stats history as secondary indicator
            if (stats) {
                const lastUpdate = new Date(stats.timestamp);
                const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));

                if (daysSinceUpdate > 7) {
                    inactiveCount++;
                } else {
                    activeCount++;
                }
            } else {
                // No stats data, use trophy count as fallback
                const expectedMinTrophies = getTownHallMinTrophies(member.townhallLevel);
                if (member.trophies < expectedMinTrophies * 0.8) {
                    inactiveCount++;
                } else {
                    unknownCount++;
                }
            }
        } else {
            // Moderate donations, count as active
            activeCount++;
        }
    });

    // Calculate activity rate
    const activityRate = (activeCount / (activeCount + inactiveCount + unknownCount)) * 100;

    // Create trend text
    let trendText = `Active: ${activeCount} (${Math.round(activityRate)}%)\n`;
    trendText += `Inactive: ${inactiveCount} (${Math.round((inactiveCount / members.length) * 100)}%)\n`;

    if (unknownCount > 0) {
        trendText += `Unknown: ${unknownCount} (${Math.round((unknownCount / members.length) * 100)}%)\n`;
    }

    // Determine overall trend assessment
    let assessment = '';
    if (activityRate > 80) {
        assessment = 'The clan is highly active! 🔥';
    } else if (activityRate > 60) {
        assessment = 'The clan has good activity overall.';
    } else if (activityRate > 40) {
        assessment = 'The clan has moderate activity.';
    } else {
        assessment = 'The clan could use more active members. ⚠️';
    }

    trendText += `\n${assessment}`;

    return {
        activeRate: activityRate,
        text: trendText,
        assessment: assessment
    };
}

/**
 * Calculate activity rating for a player
 */
function calculateActivityRating(playerData, playerStats) {
    // Initialize rating factors
    const ratingFactors = {
        donations: 0,
        warStars: 0,
        trophies: 0,
        recentActivity: 0
    };

    // Donations factor (scale of 0-5)
    if (playerData.donations) {
        if (playerData.donations > 2000) ratingFactors.donations = 5;
        else if (playerData.donations > 1000) ratingFactors.donations = 4;
        else if (playerData.donations > 500) ratingFactors.donations = 3;
        else if (playerData.donations > 200) ratingFactors.donations = 2;
        else if (playerData.donations > 50) ratingFactors.donations = 1;
    }

    // War stars factor (scale of 0-5)
    const expectedWarStars = playerData.townhallLevel * 100; // Rough estimate
    const warStarRatio = playerData.warStars / expectedWarStars;

    if (warStarRatio > 2) ratingFactors.warStars = 5;
    else if (warStarRatio > 1.5) ratingFactors.warStars = 4;
    else if (warStarRatio > 1) ratingFactors.warStars = 3;
    else if (warStarRatio > 0.5) ratingFactors.warStars = 2;
    else if (warStarRatio > 0.2) ratingFactors.warStars = 1;

    // Trophies factor (scale of 0-5)
    const expectedTrophies = getTownHallMinTrophies(playerData.townhallLevel);
    const trophyRatio = playerData.trophies / expectedTrophies;

    if (trophyRatio > 1.5) ratingFactors.trophies = 5;
    else if (trophyRatio > 1.2) ratingFactors.trophies = 4;
    else if (trophyRatio > 1) ratingFactors.trophies = 3;
    else if (trophyRatio > 0.8) ratingFactors.trophies = 2;
    else if (trophyRatio > 0.6) ratingFactors.trophies = 1;

    // Recent activity factor (scale of 0-5)
    if (playerStats && playerStats.length > 0) {
        const mostRecent = playerStats[0];
        const lastUpdate = new Date(mostRecent.timestamp);
        const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));

        if (daysSinceUpdate < 1) ratingFactors.recentActivity = 5;
        else if (daysSinceUpdate < 3) ratingFactors.recentActivity = 4;
        else if (daysSinceUpdate < 7) ratingFactors.recentActivity = 3;
        else if (daysSinceUpdate < 14) ratingFactors.recentActivity = 2;
        else if (daysSinceUpdate < 30) ratingFactors.recentActivity = 1;
    }

    // Calculate overall score (weighted)
    const weightedScore =
        (ratingFactors.donations * 0.3) +
        (ratingFactors.warStars * 0.25) +
        (ratingFactors.trophies * 0.15) +
        (ratingFactors.recentActivity * 0.3);

    const normalizedScore = Math.round(weightedScore / 0.05) / 20; // Scale to 0-5

    // Create rating text
    let ratingText = '';
    let emoji = '';

    if (normalizedScore >= 4.5) {
        ratingText = 'Exceptional';
        emoji = '🌟';
    } else if (normalizedScore >= 3.5) {
        ratingText = 'Very Active';
        emoji = '🔥';
    } else if (normalizedScore >= 2.5) {
        ratingText = 'Active';
        emoji = '✅';
    } else if (normalizedScore >= 1.5) {
        ratingText = 'Moderately Active';
        emoji = '⚠️';
    } else {
        ratingText = 'Low Activity';
        emoji = '❌';
    }

    // Create detailed text
    let detailedText = `${emoji} **${ratingText}** (${normalizedScore.toFixed(1)}/5)\n\n`;
    detailedText += `Donations: ${'⭐'.repeat(ratingFactors.donations)}${'☆'.repeat(5 - ratingFactors.donations)}\n`;
    detailedText += `War Participation: ${'⭐'.repeat(ratingFactors.warStars)}${'☆'.repeat(5 - ratingFactors.warStars)}\n`;
    detailedText += `Trophy Pushing: ${'⭐'.repeat(ratingFactors.trophies)}${'☆'.repeat(5 - ratingFactors.trophies)}\n`;
    detailedText += `Recent Activity: ${'⭐'.repeat(ratingFactors.recentActivity)}${'☆'.repeat(5 - ratingFactors.recentActivity)}\n`;

    return {
        score: normalizedScore,
        rating: ratingText,
        text: detailedText
    };
}

/**
 * Get expected minimum trophies for a town hall level
 */
function getTownHallMinTrophies(thLevel) {
    const baseTrophies = {
        15: 5000,
        14: 4400,
        13: 3800,
        12: 3200,
        11: 2600,
        10: 2200,
        9: 1800,
        8: 1400,
        7: 1200,
        6: 1000,
        5: 800,
        4: 600,
        3: 400,
        2: 200,
        1: 100
    };

    return baseTrophies[thLevel] || 1000;
}

/**
 * Get emoji for clan role
 */
function getRoleEmoji(role) {
    switch (role?.toLowerCase()) {
        case 'leader': return '👑';
        case 'coleader': return '⭐';
        case 'admin': return '⭐'; // In case API uses admin instead of coleader
        case 'elder': return '🔶';
        default: return '👤';
    }
}

/**
 * Split array into chunks
 */
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}