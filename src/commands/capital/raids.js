// src/commands/capital/raids.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const ErrorHandler = require('../../utils/errorHandler');

// Add this at the top of the file
const { getModel } = require('../../models/modelRegistry');

// Then, instead of:
// const Base = mongoose.model('Base', baseSchema);

// Use:
const Base = getModel('Base', baseSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raids')
        .setDescription('Track Clan Capital Raid Weekends')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check current Raid Weekend status and progress'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('participation')
                .setDescription('Show member participation in Raid Weekend'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Display Raid Weekend contribution leaderboard')),

    category: 'Clan Capital',

    longDescription: 'Track and monitor Clan Capital Raid Weekend activity. See the current raid status, member participation rates, and contribution leaderboards.',

    examples: [
        '/raids status',
        '/raids participation',
        '/raids leaderboard'
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

            // Get clan info
            const clanData = await clashApiService.getClan(linkedClan.clanTag);

            // Get capital raid data
            const capitalRaidData = await clashApiService.getCapitalRaidSeasons(linkedClan.clanTag, { limit: 1 });

            if (!capitalRaidData || !capitalRaidData.items || capitalRaidData.items.length === 0) {
                return interaction.editReply("Could not retrieve Raid Weekend data. The clan may not have participated in any Raid Weekends yet.");
            }

            // Most recent raid season
            const currentRaid = capitalRaidData.items[0];

            switch (subcommand) {
                case 'status':
                    await showRaidStatus(interaction, clanData, currentRaid);
                    break;
                case 'participation':
                    await showParticipation(interaction, clanData, currentRaid);
                    break;
                case 'leaderboard':
                    await showLeaderboard(interaction, clanData, currentRaid);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in raids command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'raids command'));
        }
    },
};

/**
 * Show current raid weekend status
 */
async function showRaidStatus(interaction, clanData, raidData) {
    // Calculate if raid is ongoing
    const isRaidWeekend = isRaidActive(raidData);

    // Get raid stats
    const totalAttacks = raidData.attackCount || 0;
    const totalDistricts = raidData.districtsDestroyed || 0;
    const totalCapitalGold = calculateTotalCapitalGold(raidData);
    const totalDefensiveReward = raidData.defensiveReward || 0;
    const totalOffensiveReward = raidData.offensiveReward || 0;
    const totalRaidMedals = totalDefensiveReward + totalOffensiveReward;

    // Create status embed
    const embed = new EmbedBuilder()
        .setColor(isRaidWeekend ? '#f1c40f' : '#3498db')
        .setTitle(`${clanData.name} - Raid Weekend ${isRaidWeekend ? '(Active)' : '(Last Completed)'}`)
        .setThumbnail(clanData.badgeUrls?.medium)
        .addFields(
            { name: 'Capital Hall Level', value: `Level ${clanData.clanCapital?.capitalHallLevel || '?'}`, inline: true },
            { name: 'Districts Destroyed', value: totalDistricts.toString(), inline: true },
            { name: 'Total Attacks Used', value: totalAttacks.toString(), inline: true },
            { name: 'Capital Gold Earned', value: totalCapitalGold.toString(), inline: true },
            { name: 'Total Raid Medals', value: totalRaidMedals.toString(), inline: true },
            { name: 'Members Participated', value: (raidData.members?.length || 0).toString(), inline: true }
        )
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add raid start/end time if known
    if (raidData.startTime) {
        const startDate = new Date(raidData.startTime);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 2); // Raid weekends last 2 days

        embed.addFields({
            name: 'Raid Weekend Period',
            value: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
        });
    }

    // Add defensive districts if available
    if (raidData.defenseSummary) {
        const defenseSummary = raidData.defenseSummary.map(district =>
            `${district.name}: ${district.destructionPercent}% destroyed (${district.attackCount} attacks)`
        ).join('\n');

        embed.addFields({ name: 'Defensive Summary', value: defenseSummary || 'No data available' });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show member participation in raid weekend
 */
async function showParticipation(interaction, clanData, raidData) {
    if (!raidData.members || raidData.members.length === 0) {
        return interaction.editReply('No participation data available for the last Raid Weekend.');
    }

    // Get clan member count
    const clanSize = clanData.members || 0;
    const participationRate = ((raidData.members.length / clanSize) * 100).toFixed(1);

    // Group members by attack count
    const attackGroups = {};
    for (const member of raidData.members) {
        const attackCount = member.attackCount || 0;
        if (!attackGroups[attackCount]) {
            attackGroups[attackCount] = [];
        }
        attackGroups[attackCount].push(member);
    }

    // Create participation embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${clanData.name} - Raid Weekend Participation`)
        .setDescription(`**${raidData.members.length}/${clanSize} members participated (${participationRate}%)**`)
        .setThumbnail(clanData.badgeUrls?.medium)
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add fields for each attack group (highest to lowest)
    const attackCounts = Object.keys(attackGroups).sort((a, b) => b - a);
    for (const count of attackCounts) {
        const members = attackGroups[count];

        // Skip if too many members to fit in one field
        if (members.length > 30) {
            embed.addFields({
                name: `Used ${count} attacks (${members.length} members)`,
                value: 'Too many members to display individually'
            });
            continue;
        }

        // Create member list
        const memberList = members.map(m => m.name).join(', ');
        embed.addFields({
            name: `Used ${count} attack${count !== '1' ? 's' : ''} (${members.length} member${members.length !== 1 ? 's' : ''})`,
            value: memberList
        });
    }

    // Calculate members who didn't participate
    const nonParticipantCount = clanSize - raidData.members.length;
    if (nonParticipantCount > 0) {
        embed.addFields({
            name: `Did not participate (${nonParticipantCount} member${nonParticipantCount !== 1 ? 's' : ''})`,
            value: 'These members did not use any Raid Weekend attacks'
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show contribution leaderboard for raid weekend
 */
async function showLeaderboard(interaction, clanData, raidData) {
    if (!raidData.members || raidData.members.length === 0) {
        return interaction.editReply('No contribution data available for the last Raid Weekend.');
    }

    // Sort members by capital gold earned
    const sortedMembers = [...raidData.members].sort((a, b) => {
        return (b.capitalResourcesLooted || 0) - (a.capitalResourcesLooted || 0);
    });

    // Calculate totals
    const totalGold = calculateTotalCapitalGold(raidData);
    const totalAttacks = raidData.attackCount || 0;

    // Create leaderboard embed
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`${clanData.name} - Capital Gold Leaderboard`)
        .setDescription(`Total Capital Gold: **${totalGold}**\nTotal Attacks: **${totalAttacks}**`)
        .setThumbnail(clanData.badgeUrls?.medium)
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add top contributors
    let leaderboardText = '';
    const topCount = Math.min(sortedMembers.length, 15); // Show up to 15 members

    for (let i = 0; i < topCount; i++) {
        const member = sortedMembers[i];
        const gold = member.capitalResourcesLooted || 0;
        const attacks = member.attackCount || 0;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;

        leaderboardText += `${medal} **${member.name}**: ${gold} gold (${attacks} attacks)\n`;
    }

    // If there are more members, add a note
    if (sortedMembers.length > topCount) {
        leaderboardText += `... and ${sortedMembers.length - topCount} more members`;
    }

    embed.addFields({ name: 'Top Contributors', value: leaderboardText });

    // Add statistics
    if (sortedMembers.length > 0) {
        const avgGold = Math.round(totalGold / sortedMembers.length);
        const avgAttacks = (totalAttacks / sortedMembers.length).toFixed(1);

        embed.addFields({
            name: 'Statistics',
            value: `Average Gold per Member: **${avgGold}**\nAverage Attacks per Member: **${avgAttacks}**`
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

// Utility functions

/**
 * Check if a raid is currently active
 */
function isRaidActive(raidData) {
    if (!raidData.startTime) return false;

    const startDate = new Date(raidData.startTime);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2); // Raid weekends last 2 days

    const now = new Date();
    return now >= startDate && now <= endDate;
}

/**
 * Calculate total capital gold earned in the raid
 */
function calculateTotalCapitalGold(raidData) {
    if (!raidData.members) return 0;

    return raidData.members.reduce((total, member) => {
        return total + (member.capitalResourcesLooted || 0);
    }, 0);
}

// Add this to your clashApiService.js file:
/*
async getCapitalRaidSeasons(clanTag, params = {}) {
    try {
        const formattedTag = this.formatTag(clanTag);
        console.log(`Getting capital raid seasons for clan: ${formattedTag}`);
        return await this.executeRequest(`/clans/${formattedTag}/capitalraidseasons`, {
            params,
            timeout: 2000
        });
    } catch (error) {
        console.error(`Error getting capital raid seasons:`, error.message);
        throw error;
    }
}
*/