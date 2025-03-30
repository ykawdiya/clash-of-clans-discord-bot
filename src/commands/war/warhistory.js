// src/commands/war/warhistory.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Clan = require('../../models/Clan');
const WarHistory = require('../../models/WarHistory');
const warTrackerService = require('../../services/warTrackerService');
const ErrorHandler = require('../../utils/errorHandler');
const User = require('../../models/User');
const { validateTag } = require('../../utils/validators');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warhistory')
        .setDescription('View detailed war history for your clan')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List recent wars')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of wars to show (max 10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('details')
                .setDescription('View detailed information about a specific war')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('War index from the list (1 = most recent)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('player')
                .setDescription("View a player's performance across recent wars")
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (e.g. #ABC123)')
                        .setRequired(false))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Discord user (if linked)')
                        .setRequired(false))),

    category: 'War',

    manualDeferring: true,

    longDescription: 'View detailed war history for your clan. The bot stores data for up to 10 recent wars, allowing you to analyze past performance even after the in-game war log no longer shows details.',

    examples: [
        '/warhistory list',
        '/warhistory list limit:5',
        '/warhistory details index:1',
        '/warhistory player tag:#ABC123',
        '/warhistory player user:@discord_user'
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
                case 'list':
                    await listWars(interaction, linkedClan);
                    break;
                case 'details':
                    await showWarDetails(interaction, linkedClan);
                    break;
                case 'player':
                    await showPlayerStats(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in warhistory command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'war history command'));
        }
    },
};

/**
 * List recent wars
 */
async function listWars(interaction, linkedClan) {
    const limit = interaction.options.getInteger('limit') || 10;

    // Fetch war history
    const wars = await WarHistory.find({ clanTag: linkedClan.clanTag })
        .sort({ endTime: -1 })
        .limit(limit);

    if (wars.length === 0) {
        return interaction.editReply('No war history found for this clan. History is tracked automatically as wars end.');
    }

    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle(`${linkedClan.name} - War History`)
        .setDescription(`Showing the ${wars.length} most recent wars`)
        .setFooter({ text: 'Use /warhistory details index:X to see full details for a specific war' });

    // Add each war as a field
    wars.forEach((war, index) => {
        const warDate = new Date(war.endTime).toLocaleDateString();
        const warResult = war.result === 'win' ? '🏆 WIN' : war.result === 'lose' ? '❌ LOSS' : '🤝 TIE';

        let fieldValue = `**Result:** ${warResult}\n`;
        fieldValue += `**Score:** ${war.clan.stars}⭐ - ${war.opponent.stars}⭐\n`;
        fieldValue += `**Destruction:** ${war.clan.destructionPercentage.toFixed(1)}% - ${war.opponent.destructionPercentage.toFixed(1)}%\n`;
        fieldValue += `**Size:** ${war.teamSize}v${war.teamSize}`;

        embed.addFields({
            name: `${index + 1}. vs ${war.opponent.name} (${warDate})`,
            value: fieldValue
        });
    });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show detailed information about a specific war
 */
async function showWarDetails(interaction, linkedClan) {
    const index = interaction.options.getInteger('index');

    // Get total count of wars first
    const warCount = await WarHistory.countDocuments({ clanTag: linkedClan.clanTag });

    if (warCount === 0) {
        return interaction.editReply('No war history found yet. History is recorded automatically as wars end.');
    }

    if (index > warCount) {
        return interaction.editReply(`War history only goes back ${warCount} war${warCount === 1 ? '' : 's'}. Please choose a number between 1 and ${warCount}.`);
    }

    // Fetch the war at the specified index (getting exactly the war we want)
    const war = await WarHistory.findOne({ clanTag: linkedClan.clanTag })
        .sort({ endTime: -1 })
        .skip(index - 1)
        .limit(1);

    if (!war) {
        return interaction.editReply(`Unable to find war #${index}. Please try again.`);
    }

    // Create main embed
    const embed = new EmbedBuilder()
        .setColor(war.result === 'win' ? '#2ecc71' : war.result === 'lose' ? '#e74c3c' : '#f1c40f')
        .setTitle(`War Details: ${linkedClan.name} vs ${war.opponent.name}`)
        .setDescription(`**Result:** ${war.result.toUpperCase()} • **Size:** ${war.teamSize}v${war.teamSize}`)
        .addFields(
            { name: `${linkedClan.name}`, value: `${war.clan.stars} ⭐ | ${war.clan.destructionPercentage.toFixed(1)}%`, inline: true },
            { name: `${war.opponent.name}`, value: `${war.opponent.stars} ⭐ | ${war.opponent.destructionPercentage.toFixed(1)}%`, inline: true }
        )
        .setFooter({ text: `War ended on ${new Date(war.endTime).toLocaleString()}` });

    // Add attack stats
    const clanAttacks = war.clan.members.reduce((total, member) => total + (member.attacks?.length || 0), 0);
    const opponentAttacks = war.opponent.members.reduce((total, member) => total + (member.attacks?.length || 0), 0);
    const totalPossibleAttacks = war.teamSize * 2;

    embed.addFields({
        name: 'Attack Usage',
        value: `${linkedClan.name}: ${clanAttacks}/${totalPossibleAttacks} (${Math.round(clanAttacks/totalPossibleAttacks*100)}%)\n${war.opponent.name}: ${opponentAttacks}/${totalPossibleAttacks} (${Math.round(opponentAttacks/totalPossibleAttacks*100)}%)`
    });

    // Add best attackers
    const clanMembers = [...war.clan.members];
    const topAttackers = clanMembers
        .filter(member => member.attacks && member.attacks.length > 0)
        .sort((a, b) => {
            // Sort by total stars, then by destruction percentage
            const aStars = a.attacks.reduce((sum, attack) => sum + attack.stars, 0);
            const bStars = b.attacks.reduce((sum, attack) => sum + attack.stars, 0);

            if (aStars !== bStars) return bStars - aStars;

            const aDestruction = a.attacks.reduce((sum, attack) => sum + attack.destructionPercentage, 0);
            const bDestruction = b.attacks.reduce((sum, attack) => sum + attack.destructionPercentage, 0);

            return bDestruction - aDestruction;
        })
        .slice(0, 3);

    if (topAttackers.length > 0) {
        const topAttackerText = topAttackers.map((member, index) => {
            const totalStars = member.attacks.reduce((sum, attack) => sum + attack.stars, 0);
            const avgDestruction = member.attacks.reduce((sum, attack) => sum + attack.destructionPercentage, 0) / member.attacks.length;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';

            return `${medal} **${member.name}**: ${totalStars}⭐ (${avgDestruction.toFixed(1)}%)`;
        }).join('\n');

        embed.addFields({ name: 'Top Performers', value: topAttackerText });
    }

    // Add missed attacks
    const missedAttacks = clanMembers
        .filter(member => !member.attacks || member.attacks.length < 2)
        .map(member => {
            const missed = 2 - (member.attacks?.length || 0);
            return `${member.name} (${missed} missed)`;
        });

    if (missedAttacks.length > 0) {
        embed.addFields({
            name: 'Missed Attacks',
            value: missedAttacks.join(', ')
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show player stats across recent wars
 */
async function showPlayerStats(interaction, linkedClan) {
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
        const validation = validateTag(playerTag);
        if (!validation.valid) {
            return interaction.editReply(validation.message);
        }
        playerTag = validation.formattedTag;
    }

    // Get player stats across wars
    const warStats = await warTrackerService.getPlayerWarStats(playerTag, linkedClan.clanTag);

    if (warStats.totalWars === 0) {
        return interaction.editReply("No war history found for this player in the clan's recent wars.");
    }

    // Get player name from most recent war
    const recentWar = await WarHistory.findOne({
        clanTag: linkedClan.clanTag,
        'clan.members.playerTag': playerTag
    }).sort({ endTime: -1 });

    const playerName = recentWar ?
        recentWar.clan.members.find(m => m.playerTag === playerTag)?.name || 'Unknown Player' :
        'Unknown Player';

    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${playerName} - War Statistics`)
        .setDescription(`Performance across ${warStats.warsParticipated} recent wars`)
        .addFields(
            { name: 'Participation', value: `${warStats.warsParticipated}/${warStats.totalWars} wars`, inline: true },
            { name: 'Attacks Used', value: `${warStats.attacksUsed}/${warStats.totalPossibleAttacks}`, inline: true },
            { name: 'Missed Attacks', value: warStats.missedAttacks.toString(), inline: true },
            { name: 'Stars Earned', value: `${warStats.starsEarned} (${warStats.averageStars.toFixed(1)} avg)`, inline: true },
            { name: 'Avg Destruction', value: `${warStats.averageDestruction.toFixed(1)}%`, inline: true },
            { name: 'Attack Performance', value: `3⭐: ${warStats.threeStarAttacks}\n2⭐: ${warStats.twoStarAttacks}\n1⭐: ${warStats.oneStarAttacks}\n0⭐: ${warStats.zeroStarAttacks}` }
        )
        .setFooter({ text: `War history includes up to 10 recent wars` });

    // Add success rate
    const successRate = warStats.attacksUsed > 0 ?
        (warStats.threeStarAttacks / warStats.attacksUsed * 100).toFixed(1) :
        '0.0';

    embed.addFields({
        name: 'Three-Star Rate',
        value: `${successRate}%`
    });

    return interaction.editReply({ embeds: [embed] });
}