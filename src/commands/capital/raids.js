// src/commands/capital/raids.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const ErrorHandler = require('../../utils/errorHandler');

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

    manualDeferring: true,

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
            let clanData;
            try {
                clanData = await clashApiService.getClan(linkedClan.clanTag);
                if (!clanData) {
                    return interaction.editReply("Could not retrieve clan data. Please try again later.");
                }
            } catch (error) {
                console.error('Error fetching clan data:', error);
                return interaction.editReply("Could not retrieve clan data. Please verify clan tag and try again later.");
            }

            // Get capital raid data
            let capitalRaidData;
            try {
                capitalRaidData = await clashApiService.getCapitalRaidSeasons(linkedClan.clanTag, { limit: 1 });

                if (!capitalRaidData || !capitalRaidData.items || capitalRaidData.items.length === 0) {
                    return interaction.editReply("Could not retrieve Raid Weekend data. The clan may not have participated in any Raid Weekends yet.");
                }
            } catch (error) {
                console.error('Error fetching capital raid data:', error);
                return interaction.editReply("Error retrieving Raid Weekend data. This could be due to API limitations or because the clan hasn't participated in Raid Weekends yet.");
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
    if (!raidData) {
        return interaction.editReply('No raid data available.');
    }

    // Calculate if raid is ongoing
    const isRaidWeekend = isRaidActive(raidData);

    // Get raid stats with better fallbacks for the API inconsistencies
    let totalAttacks = raidData.attackCount || 0;
    let totalDistricts = raidData.districtsDestroyed || 0;
    const totalCapitalGold = calculateTotalCapitalGold(raidData);
    const totalDefensiveReward = raidData.defensiveReward || 0;
    const totalOffensiveReward = raidData.offensiveReward || 0;
    const totalRaidMedals = totalDefensiveReward + totalOffensiveReward;

    // Sometimes the API doesn't correctly populate attackCount even when attacks were made
    // Infer attack count from members if we have meaningful gold earned but 0 attacks
    if (totalAttacks === 0 && totalCapitalGold > 0 && raidData.members && raidData.members.length > 0) {
        // Calculate sum of all member attacks
        const memberAttacks = raidData.members.reduce((sum, member) => {
            // If we have explicit attackCount for members, use that
            if (member && typeof member.attackCount === 'number') {
                return sum + member.attackCount;
            }
            // If a member looted gold but has no attackCount, assume at least 1 attack
            else if (member && member.capitalResourcesLooted > 0) {
                return sum + 1;
            }
            return sum;
        }, 0);

        // Use calculated value if it's greater than 0
        if (memberAttacks > 0) {
            totalAttacks = memberAttacks;
        }
    }

    // Similar logic for districts destroyed - if we have gold/attacks but 0 districts, assume at least 1
    if (totalDistricts === 0 && (totalAttacks > 0 || totalCapitalGold > 0)) {
        totalDistricts = Math.max(1, Math.floor(totalCapitalGold / 10000)); // Rough estimate
    }

    // Create status embed
    const embed = new EmbedBuilder()
        .setColor(isRaidWeekend ? '#f1c40f' : '#3498db')
        .setTitle(`${clanData.name} - Raid Weekend ${isRaidWeekend ? '(Active)' : '(Last Completed)'}`)
        .setThumbnail(clanData.badgeUrls?.medium || null)
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
        // Handle potential date parsing issues
        let startDateString = "Unknown";
        let endDateString = "Unknown";

        try {
            // Ensure we have a valid date string by checking format
            const startTimeStr = typeof raidData.startTime === 'string' ? raidData.startTime : String(raidData.startTime);

            // Try to create a valid date object
            const startDate = new Date(startTimeStr);

            // Verify the date is valid before using it
            if (!isNaN(startDate.getTime())) {
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 2); // Raid weekends last 2 days

                startDateString = startDate.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                endDateString = endDate.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } else {
                console.error('Invalid date format in raidData.startTime:', raidData.startTime);
            }
        } catch (error) {
            console.error('Error parsing raid date:', error);
        }

        embed.addFields({
            name: 'Raid Weekend Period',
            value: `${startDateString} - ${endDateString}`
        });
    }

    // Add defensive districts if available
    if (raidData.defenseSummary && raidData.defenseSummary.length > 0) {
        const defenseSummary = raidData.defenseSummary.map(district => {
            if (!district) return null;
            return `${district.name || 'Unknown'}: ${district.destructionPercent || 0}% destroyed (${district.attackCount || 0} attacks)`;
        }).filter(Boolean).join('\n');

        if (defenseSummary) {
            embed.addFields({ name: 'Defensive Summary', value: defenseSummary });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show member participation in raid weekend
 */
async function showParticipation(interaction, clanData, raidData) {
    if (!raidData || !raidData.members || raidData.members.length === 0) {
        return interaction.editReply('No participation data available for the last Raid Weekend.');
    }

    // Get clan member count
    const clanSize = clanData.members || 0;
    const participationRate = clanSize > 0 ? ((raidData.members.length / clanSize) * 100).toFixed(1) : '0.0';

    // Group members by attack count
    const attackGroups = {};
    for (const member of raidData.members) {
        if (!member) continue;

        // Determine actual attack count - if they earned gold but show 0 attacks, assume at least 1
        let attackCount = member.attackCount || 0;

        // Fix for the API inconsistency where attacks are 0 despite earning gold
        if (attackCount === 0 && member.capitalResourcesLooted > 0) {
            // Estimate attack count based on gold earned (rough approximation)
            const estimatedAttacks = Math.ceil(member.capitalResourcesLooted / 6000);
            attackCount = Math.max(1, estimatedAttacks);
        }

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
        .setThumbnail(clanData.badgeUrls?.medium || null)
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add fields for each attack group (highest to lowest)
    const attackCounts = Object.keys(attackGroups).sort((a, b) => b - a);
    if (attackCounts.length === 0) {
        embed.addFields({
            name: 'No Participation Data',
            value: 'No members have participated in the raid weekend yet.'
        });
    } else {
        for (const count of attackCounts) {
            const members = attackGroups[count];
            if (!members || members.length === 0) continue;

            // Skip if too many members to fit in one field
            if (members.length > 30) {
                embed.addFields({
                    name: `Used ${count} attacks (${members.length} members)`,
                    value: 'Too many members to display individually'
                });
                continue;
            }

            // Create member list, filtering out any undefined members
            const memberList = members
                .filter(m => m && m.name)
                .map(m => m.name)
                .join(', ');

            if (memberList) {
                embed.addFields({
                    name: `Used ${count} attack${count !== '1' ? 's' : ''} (${members.length} member${members.length !== 1 ? 's' : ''})`,
                    value: memberList
                });
            }
        }
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
    if (!raidData || !raidData.members || raidData.members.length === 0) {
        return interaction.editReply('No contribution data available for the last Raid Weekend.');
    }

    // Filter out any undefined members and sort by capital gold earned
    const validMembers = raidData.members.filter(member => member && typeof member === 'object');

    // Sort members by capital gold earned
    const sortedMembers = [...validMembers].sort((a, b) => {
        return (b.capitalResourcesLooted || 0) - (a.capitalResourcesLooted || 0);
    });

    // Calculate totals
    const totalGold = calculateTotalCapitalGold(raidData);

    // Determine actual total attacks - using calculated value if API data looks wrong
    let totalAttacks = raidData.attackCount || 0;

    // Fix for the case where totalAttacks is 0 but members have earned gold
    if (totalAttacks === 0 && totalGold > 0) {
        // Calculate estimated attacks from member data
        const calculatedAttacks = sortedMembers.reduce((sum, member) => {
            if (!member) return sum;

            // If member has explicit attack count, use it
            if (typeof member.attackCount === 'number' && member.attackCount > 0) {
                return sum + member.attackCount;
            }

            // If member earned gold but shows 0 attacks, estimate attacks
            if ((member.attackCount === 0 || !member.attackCount) && member.capitalResourcesLooted > 0) {
                const estimatedAttacks = Math.ceil(member.capitalResourcesLooted / 6000);
                return sum + Math.max(1, estimatedAttacks);
            }

            return sum;
        }, 0);

        totalAttacks = Math.max(totalAttacks, calculatedAttacks);
    }

    // Create leaderboard embed
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`${clanData.name} - Capital Gold Leaderboard`)
        .setDescription(`Total Capital Gold: **${totalGold}**\nTotal Attacks: **${totalAttacks}**`)
        .setThumbnail(clanData.badgeUrls?.medium || null)
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add top contributors
    let leaderboardText = '';
    const topCount = Math.min(sortedMembers.length, 15); // Show up to 15 members

    for (let i = 0; i < topCount; i++) {
        const member = sortedMembers[i];
        if (!member || !member.name) continue;

        const gold = member.capitalResourcesLooted || 0;
        // Fix for attack count being 0 despite earning gold
        let attacks = member.attackCount || 0;
        if (attacks === 0 && gold > 0) {
            // Estimate attacks based on gold (rough approximation)
            attacks = Math.max(1, Math.ceil(gold / 6000));
        }

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;

        leaderboardText += `${medal} **${member.name}**: ${gold} gold (${attacks} attacks)\n`;
    }

    // If there are more members, add a note
    if (sortedMembers.length > topCount) {
        leaderboardText += `... and ${sortedMembers.length - topCount} more members`;
    }

    // If no valid leaderboard text was generated
    if (!leaderboardText) {
        leaderboardText = 'No member contribution data available.';
    }

    embed.addFields({ name: 'Top Contributors', value: leaderboardText });

    // Add statistics
    if (sortedMembers.length > 0) {
        const avgGold = Math.round(totalGold / sortedMembers.length);
        const avgAttacks = totalAttacks > 0 && sortedMembers.length > 0 ?
            (totalAttacks / sortedMembers.length).toFixed(1) : '0.0';

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
    if (!raidData || !raidData.startTime) return false;

    try {
        const startDate = new Date(raidData.startTime);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 2); // Raid weekends last 2 days

        const now = new Date();
        return now >= startDate && now <= endDate;
    } catch (error) {
        console.error('Error checking if raid is active:', error);
        return false;
    }
}

/**
 * Calculate total capital gold earned in the raid
 */
function calculateTotalCapitalGold(raidData) {
    if (!raidData) return 0;

    // First try to use the pre-calculated total if available
    if (raidData.totalResourcesLooted && typeof raidData.totalResourcesLooted === 'number') {
        return raidData.totalResourcesLooted;
    }

    // Fall back to calculating from member data
    if (!raidData.members || !Array.isArray(raidData.members)) return 0;

    return raidData.members.reduce((total, member) => {
        if (!member) return total;
        return total + (member.capitalResourcesLooted || 0);
    }, 0);
}