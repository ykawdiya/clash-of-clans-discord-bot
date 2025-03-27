// src/commands/war/cwl.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a new model for CWL tracking
const cwlSeasonSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    clanTag: {
        type: String,
        required: true
    },
    season: {
        type: String, // Format: YYYY-MM (e.g., 2023-08)
        required: true
    },
    league: {
        type: String,
        default: 'Unknown'
    },
    startDate: Date,
    endDate: Date,
    wars: [{
        warTag: String,
        opponent: {
            name: String,
            tag: String
        },
        dayNumber: Number,
        result: {
            type: String,
            enum: ['win', 'lose', 'tie', 'ongoing', 'preparation']
        },
        stars: Number,
        destruction: Number,
        opponentStars: Number,
        opponentDestruction: Number
    }],
    participants: [{
        playerTag: String,
        playerName: String,
        discordId: String,
        townhallLevel: Number,
        attacksUsed: {
            type: Number,
            default: 0
        },
        starsEarned: {
            type: Number,
            default: 0
        },
        totalDestruction: {
            type: Number,
            default: 0
        },
        averageDestruction: {
            type: Number,
            default: 0
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create a compound index for efficient queries
cwlSeasonSchema.index({ guildId: 1, season: 1 }, { unique: true });

const CWLSeason = mongoose.model('CWLSeason', cwlSeasonSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cwl')
        .setDescription('Track and manage Clan War League')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start tracking a new CWL season')
                .addStringOption(option =>
                    option.setName('month')
                        .setDescription('Month (e.g., August)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('Year')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('league')
                        .setDescription('League name (e.g., Crystal I)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('war')
                .setDescription('Record a CWL war')
                .addIntegerOption(option =>
                    option.setName('day')
                        .setDescription('War day number (1-7)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(7))
                .addStringOption(option =>
                    option.setName('opponent')
                        .setDescription('Opponent clan name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('opponent_tag')
                        .setDescription('Opponent clan tag')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update player performance')
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('attacks_used')
                        .setDescription('Total attacks used')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(7))
                .addIntegerOption(option =>
                    option.setName('stars')
                        .setDescription('Total stars earned')
                        .setRequired(true)
                        .setMinValue(0))
                .addNumberOption(option =>
                    option.setName('avg_destruction')
                        .setDescription('Average destruction percentage')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roster')
                .setDescription('Show CWL roster and performance'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current CWL status and war results'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'War',

    manualDeferring: true,

    longDescription: 'Track and manage Clan War League performance. Start tracking a new season, record wars, update player statistics, and view current status and roster.',

    examples: [
        '/cwl start month:August year:2023 league:Crystal I',
        '/cwl war day:1 opponent:EnemyClan opponent_tag:#ABC123',
        '/cwl update player_tag:#XYZ789 attacks_used:2 stars:5 avg_destruction:85.5',
        '/cwl roster',
        '/cwl status'
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
                case 'start':
                    await startCWLSeason(interaction, linkedClan);
                    break;
                case 'war':
                    await recordCWLWar(interaction, linkedClan);
                    break;
                case 'update':
                    await updatePlayerPerformance(interaction, linkedClan);
                    break;
                case 'roster':
                    await showCWLRoster(interaction, linkedClan);
                    break;
                case 'status':
                    await showCWLStatus(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in CWL command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'cwl command'));
        }
    },
};

/**
 * Start tracking a new CWL season
 */
async function startCWLSeason(interaction, linkedClan) {
    const month = interaction.options.getString('month');
    const year = interaction.options.getInteger('year');
    const league = interaction.options.getString('league');

    // Create a season identifier (YYYY-MM)
    const season = `${year}-${String(getMonthNumber(month)).padStart(2, '0')}`;

    // Check if this season already exists
    const existingCWLSeason = await CWLSeason.findOne({
        guildId: interaction.guild.id,
        season: season
    });

    if (existingCWLSeason) {
        return interaction.editReply(`CWL Season for ${month} ${year} is already being tracked.`);
    }

    // Calculate approximate start/end dates
    // CWL typically runs for 8 days (1 prep day + 7 war days)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 8);

    // Create new CWL season tracking
    const cwlSeason = new CWLSeason({
        guildId: interaction.guild.id,
        clanTag: linkedClan.clanTag,
        season: season,
        league: league,
        startDate: startDate,
        endDate: endDate,
        wars: [],
        participants: []
    });

    await cwlSeason.save();

    // Try to get clan data to initialize participants
    try {
        const clanData = await clashApiService.getClan(linkedClan.clanTag);

        if (clanData && clanData.memberList) {
            // Initialize participants from clan members
            const participants = clanData.memberList.map(member => ({
                playerTag: member.tag,
                playerName: member.name,
                townhallLevel: member.townhallLevel,
                discordId: null, // Will be filled in later if linked
                attacksUsed: 0,
                starsEarned: 0,
                totalDestruction: 0,
                averageDestruction: 0
            }));

            // Find discord IDs for linked players
            const linkedUsers = await User.find({});
            for (const user of linkedUsers) {
                if (user.playerTag) {
                    const participant = participants.find(p => p.playerTag === user.playerTag);
                    if (participant) {
                        participant.discordId = user.discordId;
                    }
                }
            }

            cwlSeason.participants = participants;
            await cwlSeason.save();
        }
    } catch (error) {
        console.error('Error getting clan members:', error);
        // Continue without initializing participants
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#9b59b6') // Purple for CWL
        .setTitle('CWL Season Tracking Started')
        .setDescription(`Started tracking CWL Season for ${month} ${year}`)
        .addFields(
            { name: 'League', value: league, inline: true },
            { name: 'Clan', value: linkedClan.name, inline: true },
            { name: 'Season', value: `${month} ${year}`, inline: true },
            { name: 'Next Steps', value: 'Use `/cwl war` to record each day\'s war\nUse `/cwl update` to track player performance' }
        )
        .setFooter({ text: 'Good luck in your CWL matches!' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Record a CWL war
 */
async function recordCWLWar(interaction, linkedClan) {
    const dayNumber = interaction.options.getInteger('day');
    const opponentName = interaction.options.getString('opponent');

    // Format opponent tag
    let opponentTag = interaction.options.getString('opponent_tag');
    if (!opponentTag.startsWith('#')) {
        opponentTag = '#' + opponentTag;
    }
    opponentTag = opponentTag.toUpperCase();

    // Find active CWL season
    const activeCWLSeason = await findActiveCWLSeason(interaction.guild.id);

    if (!activeCWLSeason) {
        return interaction.editReply('No active CWL season found. Start a new season with `/cwl start` first.');
    }

    // Check if this war day has already been recorded
    const existingWar = activeCWLSeason.wars.find(w => w.dayNumber === dayNumber);
    if (existingWar) {
        return interaction.editReply(`War for day ${dayNumber} has already been recorded. Please use a different day number.`);
    }

    // Add the new war
    activeCWLSeason.wars.push({
        dayNumber: dayNumber,
        opponent: {
            name: opponentName,
            tag: opponentTag
        },
        result: 'preparation', // Default to preparation
        stars: 0,
        destruction: 0,
        opponentStars: 0,
        opponentDestruction: 0
    });

    // Sort wars by day number
    activeCWLSeason.wars.sort((a, b) => a.dayNumber - b.dayNumber);

    await activeCWLSeason.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`CWL War Recorded - Day ${dayNumber}`)
        .setDescription(`Added war against ${opponentName} (${opponentTag})`)
        .addFields(
            { name: 'Season', value: formatSeason(activeCWLSeason.season), inline: true },
            { name: 'League', value: activeCWLSeason.league, inline: true },
            { name: 'War Day', value: dayNumber.toString(), inline: true },
            { name: 'Next Steps', value: 'Use `/cwl update` to track player performance\nUse `/cwl status` to check current CWL progress' }
        );

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Update player performance in CWL
 */
async function updatePlayerPerformance(interaction, linkedClan) {
    // Format player tag
    let playerTag = interaction.options.getString('player_tag');
    if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
    }
    playerTag = playerTag.toUpperCase();

    const attacksUsed = interaction.options.getInteger('attacks_used');
    const stars = interaction.options.getInteger('stars');
    const avgDestruction = interaction.options.getNumber('avg_destruction');

    // Find active CWL season
    const activeCWLSeason = await findActiveCWLSeason(interaction.guild.id);

    if (!activeCWLSeason) {
        return interaction.editReply('No active CWL season found. Start a new season with `/cwl start` first.');
    }

    // Check if player is already in participants
    let participant = activeCWLSeason.participants.find(p => p.playerTag === playerTag);

    // If not found, try to get player data and add them
    if (!participant) {
        try {
            const playerData = await clashApiService.getPlayer(playerTag);

            // Try to find discord ID if the player is linked
            let discordId = null;
            const linkedUser = await User.findOne({ playerTag });
            if (linkedUser) {
                discordId = linkedUser.discordId;
            }

            // Add new participant
            participant = {
                playerTag: playerTag,
                playerName: playerData.name,
                townhallLevel: playerData.townhallLevel,
                discordId: discordId,
                attacksUsed: 0,
                starsEarned: 0,
                totalDestruction: 0,
                averageDestruction: 0
            };

            activeCWLSeason.participants.push(participant);

            // Get reference to the newly added participant
            participant = activeCWLSeason.participants.find(p => p.playerTag === playerTag);
        } catch (error) {
            console.error('Error getting player data:', error);
            return interaction.editReply(`Error: Could not find player with tag ${playerTag}. Please check the tag and try again.`);
        }
    }

    // Update player stats
    participant.attacksUsed = attacksUsed;
    participant.starsEarned = stars;
    participant.averageDestruction = avgDestruction;
    participant.totalDestruction = avgDestruction * attacksUsed; // Approximate

    await activeCWLSeason.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('CWL Player Performance Updated')
        .setDescription(`Updated stats for ${participant.playerName} (${playerTag})`)
        .addFields(
            { name: 'Attacks Used', value: attacksUsed.toString(), inline: true },
            { name: 'Stars Earned', value: stars.toString(), inline: true },
            { name: 'Avg. Destruction', value: `${avgDestruction.toFixed(1)}%`, inline: true }
        )
        .setFooter({ text: `CWL Season: ${formatSeason(activeCWLSeason.season)}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show CWL roster and performance
 */
async function showCWLRoster(interaction, linkedClan) {
    // Find active CWL season
    const activeCWLSeason = await findActiveCWLSeason(interaction.guild.id);

    if (!activeCWLSeason) {
        return interaction.editReply('No active CWL season found. Start a new season with `/cwl start` first.');
    }

    // Sort participants by stars, then by average destruction
    const sortedParticipants = [...activeCWLSeason.participants].sort((a, b) => {
        if (b.starsEarned !== a.starsEarned) {
            return b.starsEarned - a.starsEarned;
        }
        return b.averageDestruction - a.averageDestruction;
    });

    // Create roster embed
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`CWL Roster - ${formatSeason(activeCWLSeason.season)}`)
        .setDescription(`League: ${activeCWLSeason.league}\nClan: ${linkedClan.name}`)
        .setFooter({ text: 'Use /cwl update to update player stats' });

    // Add participant stats
    if (sortedParticipants.length === 0) {
        embed.addFields({ name: 'No Participants', value: 'No CWL participants have been recorded yet.' });
    } else {
        // Split participants into chunks for multiple fields (Discord limit)
        const chunks = chunkArray(sortedParticipants, 10);

        chunks.forEach((chunk, index) => {
            let rosterText = '';

            chunk.forEach((participant, i) => {
                const position = index * 10 + i + 1;
                const attacksDisplay = `${participant.attacksUsed}/7`;
                const starsDisplay = `⭐${participant.starsEarned}`;
                const destructionDisplay = `${participant.averageDestruction.toFixed(1)}%`;

                rosterText += `${position}. **${participant.playerName}** (TH${participant.townhallLevel}) - ${attacksDisplay} - ${starsDisplay} - ${destructionDisplay}\n`;
            });

            embed.addFields({ name: `Participants ${index * 10 + 1}-${index * 10 + chunk.length}`, value: rosterText });
        });

        // Add summary stats
        const totalAttacks = sortedParticipants.reduce((sum, p) => sum + p.attacksUsed, 0);
        const totalStars = sortedParticipants.reduce((sum, p) => sum + p.starsEarned, 0);
        const avgDestruction = sortedParticipants.reduce((sum, p) => sum + (p.attacksUsed * p.averageDestruction), 0) / totalAttacks || 0;

        embed.addFields({
            name: 'Summary',
            value: `Total Participants: ${sortedParticipants.length}\nTotal Attacks: ${totalAttacks}/56\nTotal Stars: ${totalStars}\nAvg. Destruction: ${avgDestruction.toFixed(1)}%`
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show current CWL status and war results
 */
async function showCWLStatus(interaction, linkedClan) {
    // Find active CWL season
    const activeCWLSeason = await findActiveCWLSeason(interaction.guild.id);

    if (!activeCWLSeason) {
        return interaction.editReply('No active CWL season found. Start a new season with `/cwl start` first.');
    }

    // Get all wars for this season
    const wars = activeCWLSeason.wars;

    // Create status embed
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`CWL Status - ${formatSeason(activeCWLSeason.season)}`)
        .setDescription(`League: ${activeCWLSeason.league}\nClan: ${linkedClan.name}`);

    // Add war results
    if (wars.length === 0) {
        embed.addFields({ name: 'No Wars', value: 'No CWL wars have been recorded yet. Use `/cwl war` to add wars.' });
    } else {
        let warSummary = '';
        let wins = 0;
        let losses = 0;
        let ties = 0;
        let ongoing = 0;

        wars.forEach(war => {
            const resultEmoji = getWarResultEmoji(war.result);
            warSummary += `**Day ${war.dayNumber}**: vs ${war.opponent.name} - ${resultEmoji}\n`;

            if (war.result === 'win') wins++;
            else if (war.result === 'lose') losses++;
            else if (war.result === 'tie') ties++;
            else ongoing++;
        });

        // Add war summary
        embed.addFields({ name: 'War Results', value: warSummary });

        // Add record
        embed.addFields({
            name: 'Current Record',
            value: `Wins: ${wins}  |  Losses: ${losses}  |  Ties: ${ties}  |  In Progress: ${ongoing}`
        });

        // Calculate current position if enough data
        if (wars.length > 0 && (wins + losses + ties) > 0) {
            // Each win is 10 points, tie is 5 points
            const points = (wins * 10) + (ties * 5);
            embed.addFields({ name: 'League Points', value: points.toString() });
        }
    }

    // Add participant stats summary
    const participants = activeCWLSeason.participants;
    if (participants.length > 0) {
        const totalAttacks = participants.reduce((sum, p) => sum + p.attacksUsed, 0);
        const maxAttacks = participants.length * 7; // Theoretical max (everyone uses all attacks)
        const attackPercentage = maxAttacks > 0 ? (totalAttacks / maxAttacks) * 100 : 0;

        const totalStars = participants.reduce((sum, p) => sum + p.starsEarned, 0);
        const starsPerAttack = totalAttacks > 0 ? totalStars / totalAttacks : 0;

        // Find the top performers
        const topByStars = [...participants].sort((a, b) => b.starsEarned - a.starsEarned)[0];
        const topByDestruction = [...participants].sort((a, b) => b.averageDestruction - a.averageDestruction)[0];

        let statsText = `Attacks Used: ${totalAttacks}/${maxAttacks} (${attackPercentage.toFixed(1)}%)\n`;
        statsText += `Total Stars: ${totalStars} (${starsPerAttack.toFixed(2)} per attack)\n`;

        if (topByStars) {
            statsText += `Most Stars: ${topByStars.playerName} (${topByStars.starsEarned})\n`;
        }

        if (topByDestruction) {
            statsText += `Highest Avg. Destruction: ${topByDestruction.playerName} (${topByDestruction.averageDestruction.toFixed(1)}%)`;
        }

        embed.addFields({ name: 'Performance', value: statsText });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Helper function to find active CWL season
 */
async function findActiveCWLSeason(guildId) {
    // Get the current month and year
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // First try to find CWL for the current month
    let activeSeason = await CWLSeason.findOne({
        guildId: guildId,
        season: thisMonth
    });

    // If not found, try the previous month (in case CWL started at the end of previous month)
    if (!activeSeason) {
        const lastMonth = now.getMonth() === 0
            ? `${now.getFullYear() - 1}-12`
            : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

        activeSeason = await CWLSeason.findOne({
            guildId: guildId,
            season: lastMonth
        });
    }

    // If still not found, get the most recent one
    if (!activeSeason) {
        activeSeason = await CWLSeason.findOne({
            guildId: guildId
        }).sort({ season: -1 }).limit(1);
    }

    return activeSeason;
}

/**
 * Get month number from name
 */
function getMonthNumber(monthName) {
    const months = {
        'january': 1,
        'february': 2,
        'march': 3,
        'april': 4,
        'may': 5,
        'june': 6,
        'july': 7,
        'august': 8,
        'september': 9,
        'october': 10,
        'november': 11,
        'december': 12
    };

    return months[monthName.toLowerCase()] || new Date().getMonth() + 1;
}

/**
 * Format season string (YYYY-MM) to readable format
 */
function formatSeason(season) {
    if (!season) return 'Unknown Season';

    try {
        const [year, month] = season.split('-');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        return `${monthNames[parseInt(month) - 1]} ${year}`;
    } catch (error) {
        return season;
    }
}

/**
 * Get emoji for war result
 */
function getWarResultEmoji(result) {
    switch (result) {
        case 'win': return '🏆 Win';
        case 'lose': return '❌ Loss';
        case 'tie': return '🔄 Tie';
        case 'ongoing': return '⚔️ In Progress';
        case 'preparation': return '⏳ Preparation';
        default: return '❓ Unknown';
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

// Add this to your clashApiService.js file:
/*
async getCWLWar(warTag) {
    try {
        console.log(`Getting CWL war with tag: ${warTag}`);
        return await this.executeRequest(`/clanwarleagues/wars/${encodeURIComponent(warTag)}`, { timeout: 2000 });
    } catch (error) {
        console.error(`Error getting CWL war:`, error.message);
        throw error;
    }
}
*/