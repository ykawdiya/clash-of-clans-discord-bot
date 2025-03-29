// Enhanced stats.js without visualization component
// Replace src/commands/tracking/stats.js with this version

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const User = require('../../models/User');
const PlayerStats = require('../../models/PlayerStats');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Track and visualize player stats')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your tracked player statistics')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (e.g. #ABC123)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('display')
                        .setDescription('How to display the stats')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Detailed', value: 'detailed' },
                            { name: 'Summary', value: 'summary' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('progress')
                .setDescription('Show your progress over time')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (e.g. #ABC123)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('Time period to analyze')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Week', value: 'week' },
                            { name: 'Month', value: 'month' },
                            { name: 'Quarter', value: 'quarter' },
                            { name: 'Year', value: 'year' },
                            { name: 'All Time', value: 'all' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('compare')
                .setDescription('Compare stats with another player')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag to compare with (e.g. #ABC123)')
                        .setRequired(true))),

    category: 'Tracking',

    manualDeferring: true,

    longDescription: 'Track and analyze your Clash of Clans progress over time. View stats, analyze progress trends, and compare with other players. Stats are automatically updated.',

    examples: [
        '/stats view',
        '/stats view tag:#ABC123 display:detailed',
        '/stats progress period:month',
        '/stats compare tag:#XYZ789'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'view':
                    await viewStats(interaction);
                    break;
                case 'progress':
                    await showProgress(interaction);
                    break;
                case 'compare':
                    await compareStats(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand. Please use `/help stats` for usage information.');
            }
        } catch (error) {
            console.error('Error in stats command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'stats tracking'));
        }
    },
};

/**
 * View player stats
 * @param {CommandInteraction} interaction
 */
async function viewStats(interaction) {
    try {
        // Get player tag from options or linked account
        let playerTag = interaction.options.getString('tag');
        const displayOption = interaction.options.getString('display') || 'summary';

        if (!playerTag) {
            const userDoc = await User.findOne({ discordId: interaction.user.id });

            if (!userDoc || !userDoc.playerTag) {
                return interaction.editReply("Please provide a player tag or link your account using `/link` command.");
            }

            playerTag = userDoc.playerTag;
        } else {
            // Validate the provided tag
            const validation = validateTag(playerTag);
            if (!validation.valid) {
                return interaction.editReply(validation.message);
            }
            playerTag = validation.formattedTag;
        }

        // Log command execution
        console.log(`[STATS] User ${interaction.user.id} requested view for ${playerTag} with display: ${displayOption}`);

        // Fetch player data from API
        const playerData = await clashApiService.getPlayer(playerTag);

        // Get player stats history
        const statsHistory = await PlayerStats.find({ playerTag })
            .sort({ timestamp: -1 })
            .limit(10)
            .lean();

        if (statsHistory.length === 0) {
            return interaction.editReply(`No stats found for player ${playerTag}. Stats are now collected automatically, please check back later.`);
        }

        // Handle different display options
        if (displayOption === 'detailed') {
            await sendDetailedStats(interaction, playerData, statsHistory);
        } else {
            // Default to summary
            await sendStatsSummary(interaction, playerData, statsHistory);
        }
    } catch (error) {
        console.error('Error viewing stats:', error);
        throw error;
    }
}

/**
 * Show player progress over time
 * @param {CommandInteraction} interaction
 */
async function showProgress(interaction) {
    try {
        // Get player tag from options or linked account
        let playerTag = interaction.options.getString('tag');
        const period = interaction.options.getString('period') || 'month';

        if (!playerTag) {
            const userDoc = await User.findOne({ discordId: interaction.user.id });

            if (!userDoc || !userDoc.playerTag) {
                return interaction.editReply("Please provide a player tag or link your account using `/link` command.");
            }

            playerTag = userDoc.playerTag;
        } else {
            // Validate the provided tag
            const validation = validateTag(playerTag);
            if (!validation.valid) {
                return interaction.editReply(validation.message);
            }
            playerTag = validation.formattedTag;
        }

        // Log command execution
        console.log(`[STATS] User ${interaction.user.id} requested progress for ${playerTag} with period: ${period}`);

        // Get current stats from the API
        const playerData = await clashApiService.getPlayer(playerTag);

        // Get stats history based on time period
        const now = new Date();
        let startDate;

        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                break;
            case 'month':
                startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                break;
            case 'quarter':
                startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                break;
            case 'year':
                startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
                break;
            case 'all':
            default:
                startDate = new Date(0); // Beginning of time
                break;
        }

        // Get stats within the time range
        const statsHistory = await PlayerStats.find({
            playerTag,
            timestamp: { $gte: startDate }
        }).sort({ timestamp: 1 }).lean();

        if (statsHistory.length < 2) {
            return interaction.editReply(`Not enough historical data for ${playerData.name} in the selected time period. Need at least 2 data points to show progress.`);
        }

        // Create and send progress visualization
        await sendProgressVisualization(interaction, playerData, statsHistory, period);
    } catch (error) {
        console.error('Error showing progress:', error);
        throw error;
    }
}

/**
 * Send detailed stats
 * @param {CommandInteraction} interaction
 * @param {Object} playerData
 * @param {Array} statsHistory
 */
async function sendDetailedStats(interaction, playerData, statsHistory) {
    const latestStats = statsHistory[0];
    const oldestInSample = statsHistory[statsHistory.length - 1];

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${playerData.name} - Detailed Stats`)
        .setDescription(`Town Hall: ${playerData.townHallLevel} • XP: Level ${playerData.expLevel}${playerData.clan ? ` • Clan: ${playerData.clan.name}` : ''}`)
        .addFields(
            { name: 'Trophies', value: `Current: ${playerData.trophies}\nBest: ${playerData.bestTrophies}`, inline: true },
            { name: 'War Stats', value: `Stars: ${playerData.warStars}\nAttack Wins: ${playerData.attackWins}\nDefense Wins: ${playerData.defenseWins}`, inline: true },
            { name: 'Donations', value: `Given: ${playerData.donations || 0}\nReceived: ${playerData.donationsReceived || 0}\nRatio: ${calculateDonationRatio(playerData)}`, inline: true }
        )
        .setFooter({ text: `Stats tracked since ${new Date(oldestInSample.timestamp).toLocaleDateString()}`, iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add heroes if available
    if (playerData.heroes && playerData.heroes.length > 0) {
        const heroesText = playerData.heroes.map(hero =>
            `${hero.name}: Level ${hero.level}/${hero.maxLevel}`
        ).join('\n');

        embed.addFields({ name: 'Heroes', value: heroesText });
    }

    // Add troops summary
    if (playerData.troops && playerData.troops.length > 0) {
        // Calculate average troop level as percentage of max
        const homeTroops = playerData.troops.filter(t => !t.village || t.village === 'home');
        const totalProgress = homeTroops.reduce((sum, troop) => {
            return sum + (troop.level / troop.maxLevel);
        }, 0);
        const avgProgress = (totalProgress / homeTroops.length * 100).toFixed(1);

        // Count maxed troops
        const maxedTroops = homeTroops.filter(t => t.level === t.maxLevel).length;

        embed.addFields({
            name: 'Troop Progress',
            value: `Overall: ${avgProgress}% of max\nMaxed: ${maxedTroops}/${homeTroops.length} troops`
        });
    }

    // Add progress since oldest record
    if (oldestInSample) {
        const daysSinceStart = Math.round((Date.now() - new Date(oldestInSample.timestamp).getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceStart > 0) {
            const trophyChange = playerData.trophies - oldestInSample.trophies;
            const warStarChange = playerData.warStars - oldestInSample.warStars;

            let progressText = `Over the last ${daysSinceStart} days:\n`;
            progressText += `Trophies: ${formatChange(trophyChange)}\n`;
            progressText += `War Stars: ${formatChange(warStarChange)}\n`;

            // Add town hall change if applicable
            if (playerData.townHallLevel !== oldestInSample.townHallLevel) {
                progressText += `Town Hall: ${oldestInSample.townHallLevel} → ${playerData.townHallLevel}\n`;
            }

            embed.addFields({ name: 'Recent Progress', value: progressText });
        }
    }

    // Add last update info
    const lastStatsUpdate = new Date(latestStats.timestamp);
    const updateDiff = Math.round((Date.now() - lastStatsUpdate.getTime()) / (1000 * 60 * 60));
    let updateText = '';

    if (updateDiff < 1) {
        updateText = 'Less than an hour ago';
    } else if (updateDiff < 24) {
        updateText = `${updateDiff} hour${updateDiff === 1 ? '' : 's'} ago`;
    } else {
        updateText = `${Math.floor(updateDiff / 24)} day${Math.floor(updateDiff / 24) === 1 ? '' : 's'} ago`;
    }

    embed.addFields({ name: 'Last Stats Update', value: updateText });
    embed.addFields({ name: 'Automatic Updates', value: 'Stats are now updated automatically every 6 hours' });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Send stats summary
 * @param {CommandInteraction} interaction
 * @param {Object} playerData
 * @param {Array} statsHistory
 */
async function sendStatsSummary(interaction, playerData, statsHistory) {
    const latestStats = statsHistory[0];
    const daysSinceUpdate = Math.round((Date.now() - new Date(latestStats.timestamp).getTime()) / (1000 * 60 * 60 * 24));

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`${playerData.name} - Stats Summary`)
        .setDescription(`Quick overview of ${playerData.tag}`)
        .addFields(
            { name: 'Town Hall', value: `Level ${playerData.townHallLevel}`, inline: true },
            { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
            { name: 'War Stars', value: playerData.warStars.toString(), inline: true },
            { name: 'Last Updated', value: `${daysSinceUpdate === 0 ? 'Today' : `${daysSinceUpdate} days ago`}` }
        )
        .setFooter({ text: 'Use /stats view display:detailed for more info', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add activity rating
    const activityRating = calculateActivityRating(playerData, statsHistory);
    embed.addFields({ name: 'Activity Rating', value: activityRating.text });

    // Add progress stats if available
    if (statsHistory.length >= 2) {
        const oldestStat = statsHistory[statsHistory.length - 1];
        const daysBetween = Math.round((Date.now() - new Date(oldestStat.timestamp).getTime()) / (1000 * 60 * 60 * 24));

        if (daysBetween > 0) {
            const trophyChange = playerData.trophies - oldestStat.trophies;
            const warStarChange = playerData.warStars - oldestStat.warStars;

            embed.addFields({
                name: `Progress (Last ${daysBetween} days)`,
                value: `Trophies: ${formatChange(trophyChange)}\nWar Stars: ${formatChange(warStarChange)}`
            });
        }
    }

    embed.addFields({ name: 'Auto Updates', value: 'Stats are now updated automatically every 6 hours' });

    await interaction.editReply({ embeds: [embed] });
}

// Update the sendProgressVisualization function in src/commands/tracking/stats.js

/**
 * Send progress visualization
 * @param {CommandInteraction} interaction
 * @param {Object} playerData
 * @param {Array} statsHistory
 * @param {string} period
 */
async function sendProgressVisualization(interaction, playerData, statsHistory, period) {
    // Get the oldest and most recent stats for comparison
    const oldestStats = statsHistory[0]; // First entry in the date-sorted array
    const latestStats = statsHistory[statsHistory.length - 1]; // Last entry

    // Calculate time span
    const daysBetween = Math.round((new Date(latestStats.timestamp) - new Date(oldestStats.timestamp)) / (1000 * 60 * 60 * 24));

    // Format period name for display
    const periodName = {
        'week': 'Week',
        'month': 'Month',
        'quarter': '3 Months',
        'year': 'Year',
        'all': 'All Time'
    }[period] || period;

    // Format clan role if available
    let clanInfo = '';
    if (playerData.clan) {
        // Get the proper role name with capitalization
        const roleMap = {
            'leader': 'Leader',
            'coLeader': 'Co-Leader',
            'admin': 'Co-Leader', // Some APIs use 'admin' instead of 'coLeader'
            'elder': 'Elder',
            'member': 'Member'
        };

        const roleName = roleMap[playerData.role] || 'Member';
        clanInfo = `${roleName} of ${playerData.clan.name}`;
    } else {
        clanInfo = 'Not in a clan';
    }

    // Create the progress embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(`${playerData.name} - Progress (${periodName})`)
        .setDescription(`Progress tracked over ${daysBetween} days • ${clanInfo}`)
        .setFooter({ text: `First tracked: ${new Date(oldestStats.timestamp).toLocaleDateString()}`, iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Calculate changes for key metrics
    const changes = {
        townHall: latestStats.townHallLevel - oldestStats.townHallLevel,
        trophies: latestStats.trophies - oldestStats.trophies,
        warStars: latestStats.warStars - oldestStats.warStars,
        donations: (latestStats.donations || 0) - (oldestStats.donations || 0),
        experience: latestStats.expLevel - oldestStats.expLevel
    };

    // Add basic changes
    embed.addFields(
        { name: 'Town Hall', value: `${oldestStats.townHallLevel} → ${latestStats.townHallLevel} (${formatChange(changes.townHall)})`, inline: true },
        { name: 'Trophies', value: `${oldestStats.trophies} → ${latestStats.trophies} (${formatChange(changes.trophies)})`, inline: true },
        { name: 'War Stars', value: `${oldestStats.warStars} → ${latestStats.warStars} (${formatChange(changes.warStars)})`, inline: true }
    );

    // Add hero progress if available
    if (oldestStats.heroes && latestStats.heroes) {
        const heroChanges = [];

        latestStats.heroes.forEach(currentHero => {
            const oldHero = oldestStats.heroes.find(h => h.name === currentHero.name);

            if (oldHero) {
                const levelChange = currentHero.level - oldHero.level;
                if (levelChange !== 0) {
                    heroChanges.push(`${currentHero.name}: ${oldHero.level} → ${currentHero.level} (${formatChange(levelChange)})`);
                }
            } else {
                // New hero
                heroChanges.push(`${currentHero.name}: Unlocked! (Level ${currentHero.level})`);
            }
        });

        if (heroChanges.length > 0) {
            embed.addFields({ name: 'Hero Progress', value: heroChanges.join('\n') });
        }
    }

    // If time span is significant, calculate average progress per month
    if (daysBetween >= 30) {
        const monthsTracking = daysBetween / 30;
        const trophiesPerMonth = Math.round(changes.trophies / monthsTracking);
        const warStarsPerMonth = Math.round(changes.warStars / monthsTracking);

        embed.addFields({
            name: 'Monthly Average',
            value: `Trophies: ${formatChange(trophiesPerMonth)}/month\nWar Stars: ${formatChange(warStarsPerMonth)}/month`
        });
    }

    // Add data point information
    embed.addFields({
        name: 'Data Points',
        value: `${statsHistory.length} data points over ${daysBetween} days`
    });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Compare stats with another player
 * @param {CommandInteraction} interaction
 */
async function compareStats(interaction) {
    try {
        // Get own player tag
        let ownPlayerTag;
        const userDoc = await User.findOne({ discordId: interaction.user.id });

        if (!userDoc || !userDoc.playerTag) {
            return interaction.editReply("Please link your account first using `/link` command before comparing.");
        }

        ownPlayerTag = userDoc.playerTag;

        // Get comparison player tag
        let comparePlayerTag = interaction.options.getString('tag');

        // Validate the provided tag
        const validation = validateTag(comparePlayerTag);
        if (!validation.valid) {
            return interaction.editReply(validation.message);
        }
        comparePlayerTag = validation.formattedTag;

        // Log command execution
        console.log(`[STATS] User ${interaction.user.id} requested compare for ${comparePlayerTag}`);

        // Fetch both players' data
        const [ownPlayerData, comparePlayerData] = await Promise.all([
            clashApiService.getPlayer(ownPlayerTag),
            clashApiService.getPlayer(comparePlayerTag)
        ]);

        // Create comparison embed
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('Player Comparison')
            .setDescription(`Comparing **${ownPlayerData.name}** with **${comparePlayerData.name}**`)
            .addFields(
                {
                    name: 'Town Hall',
                    value: compareValues(ownPlayerData.name, ownPlayerData.townHallLevel, comparePlayerData.name, comparePlayerData.townHallLevel),
                    inline: true
                },
                {
                    name: 'Trophies',
                    value: compareValues(ownPlayerData.name, ownPlayerData.trophies, comparePlayerData.name, comparePlayerData.trophies),
                    inline: true
                },
                {
                    name: 'War Stars',
                    value: compareValues(ownPlayerData.name, ownPlayerData.warStars, comparePlayerData.name, comparePlayerData.warStars),
                    inline: true
                },
                {
                    name: 'Experience',
                    value: compareValues(ownPlayerData.name, ownPlayerData.expLevel, comparePlayerData.name, comparePlayerData.expLevel),
                    inline: true
                },
                {
                    name: 'Attack Wins',
                    value: compareValues(ownPlayerData.name, ownPlayerData.attackWins, comparePlayerData.name, comparePlayerData.attackWins),
                    inline: true
                },
                {
                    name: 'Defense Wins',
                    value: compareValues(ownPlayerData.name, ownPlayerData.defenseWins, comparePlayerData.name, comparePlayerData.defenseWins),
                    inline: true
                }
            )
            .setFooter({ text: 'Comparison based on current stats', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        // Compare hero levels if present
        if (ownPlayerData.heroes && comparePlayerData.heroes) {
            // Create maps for quicker lookup
            const ownHeroMap = new Map();
            if (Array.isArray(ownPlayerData.heroes)) {
                ownPlayerData.heroes.forEach(hero => {
                    if (hero && hero.name) {
                        ownHeroMap.set(hero.name, hero.level);
                    }
                });
            }

            const compareHeroMap = new Map();
            if (Array.isArray(comparePlayerData.heroes)) {
                comparePlayerData.heroes.forEach(hero => {
                    if (hero && hero.name) {
                        compareHeroMap.set(hero.name, hero.level);
                    }
                });
            }

            // Get all unique hero names
            const allHeroNames = [...new Set([
                ...Array.from(ownHeroMap.keys()),
                ...Array.from(compareHeroMap.keys())
            ])];

            if (allHeroNames.length > 0) {
                const heroComparison = allHeroNames.map(heroName => {
                    const ownLevel = ownHeroMap.get(heroName) || 0;
                    const compareLevel = compareHeroMap.get(heroName) || 0;
                    const diff = ownLevel - compareLevel;
                    const indicator = diff === 0 ? '=' : (diff > 0 ? '🔼' : '🔽');
                    const diffText = diff === 0 ? 'Equal' : (diff > 0 ? `+${diff}` : String(diff));

                    return `${heroName}: ${ownLevel} vs ${compareLevel} ${indicator} (${diffText})`;
                }).join('\n');

                if (heroComparison) {
                    embed.addFields({ name: 'Hero Comparison', value: heroComparison });
                }
            }
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error comparing stats:', error);
        throw error;
    }
}

/**
 * Format change with +/- and color indicators
 * @param {number} change
 * @returns {string}
 */
function formatChange(change) {
    if (change > 0) {
        return `+${change}`;
    } else if (change < 0) {
        return `${change}`;
    } else {
        return `0`;
    }
}

/**
 * Calculate donation ratio
 * @param {Object} playerData
 * @returns {string}
 */
function calculateDonationRatio(playerData) {
    const donations = playerData.donations || 0;
    const received = playerData.donationsReceived || 0;

    if (received === 0) return 'N/A';
    return (donations / received).toFixed(2);
}

/**
 * Calculate player activity rating
 * @param {Object} playerData
 * @param {Array} playerStats
 * @returns {Object}
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
    const expectedWarStars = playerData.townHallLevel * 100; // Rough estimate
    const warStarRatio = playerData.warStars / expectedWarStars;

    if (warStarRatio > 2) ratingFactors.warStars = 5;
    else if (warStarRatio > 1.5) ratingFactors.warStars = 4;
    else if (warStarRatio > 1) ratingFactors.warStars = 3;
    else if (warStarRatio > 0.5) ratingFactors.warStars = 2;
    else if (warStarRatio > 0.2) ratingFactors.warStars = 1;

    // Trophies factor (scale of 0-5)
    const expectedTrophies = getTownHallMinTrophies(playerData.townHallLevel);
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

    // Create a simplified activity indicator for summary view
    return {
        score: normalizedScore,
        rating: ratingText,
        text: `${emoji} **${ratingText}** (${normalizedScore.toFixed(1)}/5)`
    };
}

/**
 * Get expected minimum trophies for a town hall level
 * @param {number} thLevel
 * @returns {number}
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
 * Compare two values and return formatted string with indicators
 * @param {string} name1
 * @param {any} value1
 * @param {string} name2
 * @param {any} value2
 * @returns {string}
 */
function compareValues(name1, value1, name2, value2) {
    const diff = value1 - value2;
    let indicator = '';

    if (diff > 0) {
        indicator = `🔼 +${diff}`;
    } else if (diff < 0) {
        indicator = `🔽 ${diff}`;
    } else {
        indicator = '= Equal';
    }

    return `${name1}: **${value1}**\n${name2}: **${value2}**\n${indicator}`;
}