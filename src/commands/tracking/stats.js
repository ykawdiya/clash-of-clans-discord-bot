const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const User = require('../../models/User');
const PlayerStats = require('../../models/PlayerStats'); // We'll define this model next
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

// Timeout mechanism for API calls
const fetchWithTimeout = async (promise, timeout = 5000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Track and compare player stats over time')
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update your tracked player statistics')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (e.g. #ABC123)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('progress')
                .setDescription('Show your progress over time')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (e.g. #ABC123)')
                        .setRequired(false)))
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

    longDescription: 'Track and compare your Clash of Clans progress over time. You can update your stats, view your progress history, and compare your stats with other players. If you\'ve linked your account with the `/link` command, your tag will be used automatically.',

    examples: [
        '/stats update',
        '/stats update tag:#ABC123',
        '/stats progress',
        '/stats progress tag:#ABC123',
        '/stats compare tag:#XYZ789'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'update':
                    await updateStats(interaction);
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
 * Update player stats in the database
 * @param {CommandInteraction} interaction
 */
async function updateStats(interaction) {
    try {
        // Get player tag from options or linked account
        let playerTag = interaction.options.getString('tag');

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
        console.log(`[STATS] User ${interaction.user.id} requested update for ${playerTag}`);
        // Fetch player data from API with timeout
        const playerData = await fetchWithTimeout(clashApiService.getPlayer(playerTag));

        // Create stats object
        const stats = {
            playerTag: playerData.tag,
            discordId: interaction.user.id,
            timestamp: new Date(),
            name: playerData.name,
            townHallLevel: playerData.townHallLevel,
            expLevel: playerData.expLevel,
            trophies: playerData.trophies,
            bestTrophies: playerData.bestTrophies,
            warStars: playerData.warStars,
            attackWins: playerData.attackWins,
            defenseWins: playerData.defenseWins,
            builderHallLevel: playerData.builderHallLevel || 0,
            versusTrophies: playerData.versusTrophies || 0,
            clanName: playerData.clan?.name || 'No Clan',
            clanTag: playerData.clan?.tag || '',
            heroes: playerData.heroes?.map(hero => ({
                name: hero.name,
                level: hero.level,
                maxLevel: hero.maxLevel
            })) || [],
            troops: playerData.troops?.filter(troop => !troop.village || troop.village === 'home')
                .map(troop => ({
                    name: troop.name,
                    level: troop.level,
                    maxLevel: troop.maxLevel
                })) || [],
            builderBaseTroops: playerData.troops?.filter(troop => troop.village === 'builderBase')
                .map(troop => ({
                    name: troop.name,
                    level: troop.level,
                    maxLevel: troop.maxLevel
                })) || [],
            spells: playerData.spells?.map(spell => ({
                name: spell.name,
                level: spell.level,
                maxLevel: spell.maxLevel
            })) || []
        };

        // Save to database
        await PlayerStats.create(stats);

        // Create success embed
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('Stats Updated Successfully')
            .setDescription(`Stats for **${playerData.name}** (${playerData.tag}) have been updated.`)
            .addFields(
                { name: 'Town Hall', value: `Level ${playerData.townHallLevel}`, inline: true },
                { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
                { name: 'War Stars', value: playerData.warStars.toString(), inline: true }
            )
            .setFooter({ text: 'Stats are now being tracked', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error updating stats:', error);
        if (error.name === 'MongoError' || error.name === 'ValidationError') {
            return interaction.editReply(ErrorHandler.handleDatabaseError(error));
        }
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

        // Get stats history ordered by timestamp
        const statsHistory = await PlayerStats.find({ playerTag })
            .sort({ timestamp: 1 })
            .lean();

        if (statsHistory.length === 0) {
            return interaction.editReply(`No stats found for player ${playerTag}. Use \`/stats update\` to start tracking.`);
        }

        // Log command execution
        console.log(`[STATS] User ${interaction.user.id} requested progress for ${playerTag}`);
        // Get current stats from the API for the most up-to-date information with timeout
        const currentPlayerData = await fetchWithTimeout(clashApiService.getPlayer(playerTag));

        // Get the oldest and most recent stats
        const oldestStats = statsHistory[0];
        const latestStats = statsHistory[statsHistory.length - 1];

        // Calculate differences
        const trophyDiff = currentPlayerData.trophies - oldestStats.trophies;
        const warStarsDiff = currentPlayerData.warStars - oldestStats.warStars;
        const thLevelDiff = currentPlayerData.townHallLevel - oldestStats.townHallLevel;

        // Calculate hero progress if heroes exist
        let heroProgress = '';
        if (currentPlayerData.heroes && currentPlayerData.heroes.length > 0) {
            // Find matching heroes in oldest stats
            const oldHeroes = oldestStats.heroes || [];

            heroProgress = currentPlayerData.heroes.map(hero => {
                const oldHero = oldHeroes.find(h => h.name === hero.name);
                if (oldHero) {
                    const levelDiff = hero.level - oldHero.level;
                    return `${hero.name}: ${oldHero.level} → ${hero.level} (${levelDiff > 0 ? '+' : ''}${levelDiff})`;
                } else {
                    return `${hero.name}: ${hero.level}/${hero.maxLevel} (New)`;
                }
            }).join('\n');
        }

        // Calculate days since tracking started
        const daysSinceStart = Math.round((Date.now() - new Date(oldestStats.timestamp).getTime()) / (1000 * 60 * 60 * 24));

        // Create progress embed
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`Progress Report: ${currentPlayerData.name}`)
            .setDescription(`Stats tracked for ${daysSinceStart} days${currentPlayerData.clan ? ` • Member of ${currentPlayerData.clan.name}` : ''}`)
            .addFields(
                { name: 'Town Hall', value: `${oldestStats.townHallLevel} → ${currentPlayerData.townHallLevel} (${thLevelDiff > 0 ? '+' : ''}${thLevelDiff})`, inline: true },
                { name: 'Trophies', value: `${oldestStats.trophies} → ${currentPlayerData.trophies} (${trophyDiff > 0 ? '+' : ''}${trophyDiff})`, inline: true },
                { name: 'War Stars', value: `${oldestStats.warStars} → ${currentPlayerData.warStars} (${warStarsDiff > 0 ? '+' : ''}${warStarsDiff})`, inline: true }
            )
            .setFooter({ text: `First tracked: ${new Date(oldestStats.timestamp).toLocaleDateString()}`, iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        // Add hero progress if available
        if (heroProgress) {
            embed.addFields({ name: 'Hero Progress', value: heroProgress });
        }

        // If time span is significant, calculate average progress per month
        if (daysSinceStart >= 30) {
            const monthsTracking = daysSinceStart / 30;
            const trophiesPerMonth = Math.round(trophyDiff / monthsTracking);
            const warStarsPerMonth = Math.round(warStarsDiff / monthsTracking);

            embed.addFields({
                name: 'Monthly Average',
                value: `Trophies: ${trophiesPerMonth > 0 ? '+' : ''}${trophiesPerMonth}\nWar Stars: ${warStarsPerMonth > 0 ? '+' : ''}${warStarsPerMonth}`
            });
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error showing progress:', error);
        if (error.name === 'MongoError') {
            return interaction.editReply(ErrorHandler.handleDatabaseError(error));
        }
        throw error;
    }
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
        // Fetch both players' data with timeout
        const [ownPlayerData, comparePlayerData] = await Promise.all([
            fetchWithTimeout(clashApiService.getPlayer(ownPlayerTag)),
            fetchWithTimeout(clashApiService.getPlayer(comparePlayerTag))
        ]);

        // Create comparison embed
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('Player Comparison')
            .setDescription(`Comparing **${ownPlayerData.name}** with **${comparePlayerData.name}**`)
            .addFields(
                {
                    name: 'Town Hall',
                    value: `${ownPlayerData.name}: ${ownPlayerData.townHallLevel}\n${comparePlayerData.name}: ${comparePlayerData.townHallLevel}`,
                    inline: true
                },
                {
                    name: 'Trophies',
                    value: `${ownPlayerData.name}: ${ownPlayerData.trophies}\n${comparePlayerData.name}: ${comparePlayerData.trophies}`,
                    inline: true
                },
                {
                    name: 'War Stars',
                    value: `${ownPlayerData.name}: ${ownPlayerData.warStars}\n${comparePlayerData.name}: ${comparePlayerData.warStars}`,
                    inline: true
                },
                {
                    name: 'Experience',
                    value: `${ownPlayerData.name}: ${ownPlayerData.expLevel}\n${comparePlayerData.name}: ${comparePlayerData.expLevel}`,
                    inline: true
                },
                {
                    name: 'Attack Wins',
                    value: `${ownPlayerData.name}: ${ownPlayerData.attackWins}\n${comparePlayerData.name}: ${comparePlayerData.attackWins}`,
                    inline: true
                },
                {
                    name: 'Defense Wins',
                    value: `${ownPlayerData.name}: ${ownPlayerData.defenseWins}\n${comparePlayerData.name}: ${comparePlayerData.defenseWins}`,
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
                    const diffText = diff === 0 ? 'Equal' : (diff > 0 ? `+${diff}` : String(diff));

                    return `${heroName}: ${ownLevel} vs ${compareLevel} (${diffText})`;
                }).join('\n');

                if (heroComparison) {
                    embed.addFields({ name: 'Hero Comparison', value: heroComparison });
                }
            }
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error comparing stats:', error);
        throw error;
    }
}