// src/commands/clan/clangames.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a new model for clan games tracking
const clanGamesSchema = new mongoose.Schema({
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
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    goalPoints: {
        type: Number,
        default: 50000
    },
    participants: [{
        playerTag: String,
        playerName: String,
        discordId: String,
        points: {
            type: Number,
            default: 0
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create a compound index for efficient queries
clanGamesSchema.index({ guildId: 1, season: 1 }, { unique: true });

const ClanGames = mongoose.model('ClanGames', clanGamesSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clangames')
        .setDescription('Track and manage Clan Games participation')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start tracking a new Clan Games season')
                .addStringOption(option =>
                    option.setName('month')
                        .setDescription('Month of the Clan Games (e.g., January)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('Year of the Clan Games')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('start_date')
                        .setDescription('Start date (YYYY-MM-DD)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('end_date')
                        .setDescription('End date (YYYY-MM-DD)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('goal')
                        .setDescription('Clan points goal (default: 50000)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update a player\'s Clan Games points')
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag (e.g., #ABC123)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('points')
                        .setDescription('Current total points (not the difference)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('player_name')
                        .setDescription('Player name (if not linked)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check current Clan Games status and progress'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show Clan Games leaderboard'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'Clan Management',

    manualDeferring: true,

    longDescription: 'Track and manage Clan Games participation and points. Start tracking a new season, update player scores, check clan progress, and view the points leaderboard.',

    examples: [
        '/clangames start month:August year:2023 start_date:2023-08-22 end_date:2023-08-28',
        '/clangames update player_tag:#ABC123 points:4000',
        '/clangames status',
        '/clangames leaderboard'
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
                    await startClanGames(interaction, linkedClan);
                    break;
                case 'update':
                    await updatePlayerPoints(interaction, linkedClan);
                    break;
                case 'status':
                    await showStatus(interaction, linkedClan);
                    break;
                case 'leaderboard':
                    await showLeaderboard(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in clangames command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'clan games command'));
        }
    },
};

/**
 * Start tracking a new clan games season
 */
async function startClanGames(interaction, linkedClan) {
    const month = interaction.options.getString('month');
    const year = interaction.options.getInteger('year');
    const startDateStr = interaction.options.getString('start_date');
    const endDateStr = interaction.options.getString('end_date');
    const goalPoints = interaction.options.getInteger('goal') || 50000;

    // Validate dates
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return interaction.editReply('Invalid date format. Please use YYYY-MM-DD format.');
    }

    if (endDate <= startDate) {
        return interaction.editReply('End date must be after start date.');
    }

    // Create a season identifier
    const season = `${month.toLowerCase()}-${year}`;

    // Check if this season already exists
    const existingClanGames = await ClanGames.findOne({
        guildId: interaction.guild.id,
        season: season
    });

    if (existingClanGames) {
        return interaction.editReply(`Clan Games for ${month} ${year} is already being tracked. Use the update command to modify points.`);
    }

    // Create new clan games tracking
    const clanGames = new ClanGames({
        guildId: interaction.guild.id,
        clanTag: linkedClan.clanTag,
        season: season,
        startDate: startDate,
        endDate: endDate,
        goalPoints: goalPoints,
        participants: []
    });

    await clanGames.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Clan Games Tracking Started')
        .setDescription(`Started tracking Clan Games for ${month} ${year}`)
        .addFields(
            { name: 'Start Date', value: startDate.toLocaleDateString(), inline: true },
            { name: 'End Date', value: endDate.toLocaleDateString(), inline: true },
            { name: 'Clan Points Goal', value: goalPoints.toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Use /clangames update to record player points' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Update a player's clan games points
 */
async function updatePlayerPoints(interaction, linkedClan) {
    // Format player tag
    let playerTag = interaction.options.getString('player_tag');
    if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
    }
    playerTag = playerTag.toUpperCase();

    const points = interaction.options.getInteger('points');
    const playerName = interaction.options.getString('player_name');

    // Validate points
    if (points < 0 || points > 5000) {
        return interaction.editReply('Points must be between 0 and 5000.');
    }

    // Find the active clan games
    const activeClanGames = await findActiveClanGames(interaction.guild.id);

    if (!activeClanGames) {
        return interaction.editReply('No active Clan Games found. Start tracking with `/clangames start` first.');
    }

    // Check if player is already in participants
    const existingParticipant = activeClanGames.participants.find(p => p.playerTag === playerTag);

    // Try to find discord ID if the player is linked
    let discordId = null;
    let resolvedPlayerName = playerName;

    const linkedUser = await User.findOne({ playerTag: playerTag });
    if (linkedUser) {
        discordId = linkedUser.discordId;

        // Try to get member if they're in the server
        if (!resolvedPlayerName) {
            try {
                const member = await interaction.guild.members.fetch(discordId);
                resolvedPlayerName = member.displayName;
            } catch (error) {
                // Member not in server or error fetching
                console.error('Error fetching member:', error);
            }
        }
    }

    // Update or add participant
    if (existingParticipant) {
        // Update existing participant
        existingParticipant.points = points;
        existingParticipant.lastUpdated = new Date();

        // Only update name if provided
        if (resolvedPlayerName) {
            existingParticipant.playerName = resolvedPlayerName;
        }

        // Update discordId if found
        if (discordId) {
            existingParticipant.discordId = discordId;
        }
    } else {
        // Require player name for new participants
        if (!resolvedPlayerName) {
            return interaction.editReply('Player name is required for new participants. Please provide the player_name parameter.');
        }

        // Add new participant
        activeClanGames.participants.push({
            playerTag: playerTag,
            playerName: resolvedPlayerName,
            discordId: discordId,
            points: points,
            lastUpdated: new Date()
        });
    }

    await activeClanGames.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Clan Games Points Updated')
        .setDescription(`Updated points for ${resolvedPlayerName || playerTag}`)
        .addFields(
            { name: 'Current Points', value: points.toLocaleString(), inline: true },
            { name: 'Last Updated', value: new Date().toLocaleString(), inline: true }
        );

    // Add clan total information
    const totalPoints = activeClanGames.participants.reduce((sum, p) => sum + p.points, 0);
    const progress = (totalPoints / activeClanGames.goalPoints) * 100;

    embed.addFields(
        { name: 'Clan Total', value: `${totalPoints.toLocaleString()} / ${activeClanGames.goalPoints.toLocaleString()} (${progress.toFixed(1)}%)`, inline: false }
    );

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show current clan games status
 */
async function showStatus(interaction, linkedClan) {
    // Find the active clan games
    const activeClanGames = await findActiveClanGames(interaction.guild.id);

    if (!activeClanGames) {
        return interaction.editReply('No active Clan Games found. Start tracking with `/clangames start` first.');
    }

    // Calculate stats
    const totalPoints = activeClanGames.participants.reduce((sum, p) => sum + p.points, 0);
    const progress = (totalPoints / activeClanGames.goalPoints) * 100;
    const participantCount = activeClanGames.participants.length;
    const maxPointsPlayers = activeClanGames.participants.filter(p => p.points >= 4000).length;

    // Calculate time remaining
    const now = new Date();
    const endDate = new Date(activeClanGames.endDate);
    const timeRemaining = endDate > now ? formatTimeRemaining(endDate - now) : 'Ended';

    // Create status bars for progress visualization
    const progressBar = createProgressBar(progress);

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`Clan Games Status - ${activeClanGames.season.charAt(0).toUpperCase() + activeClanGames.season.slice(1)}`)
        .setDescription(`Progress: ${totalPoints.toLocaleString()} / ${activeClanGames.goalPoints.toLocaleString()} points (${progress.toFixed(1)}%)`)
        .addFields(
            { name: 'Progress Bar', value: progressBar, inline: false },
            { name: 'Time Remaining', value: timeRemaining, inline: true },
            { name: 'Participants', value: participantCount.toString(), inline: true },
            { name: 'Max Points (4000+)', value: maxPointsPlayers.toString(), inline: true }
        )
        .setFooter({ text: `Started: ${new Date(activeClanGames.startDate).toLocaleDateString()} • Ends: ${new Date(activeClanGames.endDate).toLocaleDateString()}` })
        .setTimestamp();

    // Add top contributors
    if (participantCount > 0) {
        const topContributors = [...activeClanGames.participants]
            .sort((a, b) => b.points - a.points)
            .slice(0, 5);

        const topContributorsList = topContributors.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            return `${medal} **${p.playerName}**: ${p.points.toLocaleString()} points`;
        }).join('\n');

        embed.addFields({ name: 'Top Contributors', value: topContributorsList });
    }

    // Add non-participants count if it can be determined
    if (linkedClan.memberCount) {
        const nonParticipants = linkedClan.memberCount - participantCount;
        if (nonParticipants > 0) {
            embed.addFields({
                name: 'Not Participating',
                value: `${nonParticipants} clan members have not earned any points yet`
            });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show clan games leaderboard
 */
async function showLeaderboard(interaction, linkedClan) {
    // Find the active clan games
    const activeClanGames = await findActiveClanGames(interaction.guild.id);

    if (!activeClanGames) {
        return interaction.editReply('No active Clan Games found. Start tracking with `/clangames start` first.');
    }

    // Sort participants by points
    const sortedParticipants = [...activeClanGames.participants].sort((a, b) => b.points - a.points);

    if (sortedParticipants.length === 0) {
        return interaction.editReply('No participants recorded yet. Use `/clangames update` to add players.');
    }

    // Create the embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`Clan Games Leaderboard - ${activeClanGames.season.charAt(0).toUpperCase() + activeClanGames.season.slice(1)}`)
        .setDescription(`Points earned by clan members (Total: ${sortedParticipants.reduce((sum, p) => sum + p.points, 0).toLocaleString()})`)
        .setFooter({ text: `Ends: ${new Date(activeClanGames.endDate).toLocaleDateString()}` });

    // Create participant list with ranks
    let leaderboardText = '';
    const maxDisplay = Math.min(sortedParticipants.length, 20); // Limit to 20 participants

    for (let i = 0; i < maxDisplay; i++) {
        const participant = sortedParticipants[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        let nameDisplay = participant.playerName || participant.playerTag;

        // Add mention if player is linked and in the server
        if (participant.discordId) {
            try {
                // Check if member is in server
                await interaction.guild.members.fetch(participant.discordId);
                nameDisplay = `<@${participant.discordId}>`;
            } catch (error) {
                // Member not in server, use name
            }
        }

        // Add max points indicator
        const maxPointsIndicator = participant.points >= 4000 ? ' ⭐' : '';

        leaderboardText += `${medal} ${nameDisplay}: **${participant.points.toLocaleString()}** points${maxPointsIndicator}\n`;
    }

    // If there are more participants than we're showing
    if (sortedParticipants.length > maxDisplay) {
        leaderboardText += `... and ${sortedParticipants.length - maxDisplay} more participants`;
    }

    embed.addFields({ name: 'Leaderboard', value: leaderboardText });

    // Add tiers
    const tiers = [
        { min: 4000, name: '⭐ Maxed (4000+)', color: 'Gold' },
        { min: 3000, name: '🔹 Tier 6 (3000+)', color: 'Blue' },
        { min: 2000, name: '🔸 Tier 5 (2000+)', color: 'Orange' },
        { min: 1000, name: '🟢 Tier 4 (1000+)', color: 'Green' },
        { min: 500, name: '🟡 Tier 3 (500+)', color: 'Yellow' },
        { min: 100, name: '🟠 Tier 2 (100+)', color: 'Orange' },
        { min: 1, name: '🔴 Tier 1 (1+)', color: 'Red' },
        { min: 0, name: '⚫ No participation', color: 'Gray' }
    ];

    // Count players in each tier
    const tierCounts = tiers.map(tier => {
        return {
            ...tier,
            count: sortedParticipants.filter(p => p.points >= tier.min).length
        };
    });

    // Calculate non-participants if clan size is known
    if (linkedClan.memberCount) {
        const nonParticipants = Math.max(0, linkedClan.memberCount - sortedParticipants.length);
        tierCounts[tierCounts.length - 1].count = nonParticipants;
    }

    // Add tier breakdown
    const tierText = tierCounts.map(tier => {
        return `${tier.name}: **${tier.count}** player${tier.count !== 1 ? 's' : ''}`;
    }).join('\n');

    embed.addFields({ name: 'Reward Tiers', value: tierText });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Helper function to find active clan games
 */
async function findActiveClanGames(guildId) {
    // First try to find clan games that are currently active (between start and end dates)
    const now = new Date();

    let activeClanGames = await ClanGames.findOne({
        guildId: guildId,
        startDate: { $lte: now },
        endDate: { $gte: now }
    });

    // If none found, try to find the most recently ended clan games
    if (!activeClanGames) {
        activeClanGames = await ClanGames.findOne({
            guildId: guildId
        }).sort({ endDate: -1 }).limit(1);
    }

    return activeClanGames;
}

/**
 * Create a progress bar
 */
function createProgressBar(percentage, size = 20) {
    const filledBlocks = Math.floor((percentage / 100) * size);
    const emptyBlocks = size - filledBlocks;

    // Different emoji based on progress
    let emoji = '🟩';
    if (percentage < 25) emoji = '🟥';
    else if (percentage < 50) emoji = '🟧';
    else if (percentage < 75) emoji = '🟨';

    return `${emoji.repeat(filledBlocks)}${'⬜'.repeat(emptyBlocks)} ${percentage.toFixed(1)}%`;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(ms) {
    // Convert to seconds
    let seconds = Math.floor(ms / 1000);

    // Calculate days, hours, minutes
    const days = Math.floor(seconds / (3600 * 24));
    seconds -= days * 3600 * 24;
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);

    // Format the output
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    result += `${minutes}m`;

    return result;
}