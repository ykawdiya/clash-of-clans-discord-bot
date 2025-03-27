// src/commands/war/plan.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a schema for war plans
const warPlanSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    warId: {
        type: String,
        required: true,
        unique: true
    },
    clanTag: {
        type: String,
        required: true
    },
    opponentTag: {
        type: String,
        required: true
    },
    opponentName: String,
    status: {
        type: String,
        enum: ['planning', 'started', 'ended'],
        default: 'planning'
    },
    startTime: Date,
    endTime: Date,
    assignments: [{
        opponentBaseNumber: Number,
        opponentName: String,
        opponentThLevel: Number,
        attackers: [{
            playerTag: String,
            playerName: String,
            discordId: String,
            priority: {
                type: Number,
                default: 1
            },
            status: {
                type: String,
                enum: ['assigned', 'pending', 'completed', 'failed'],
                default: 'assigned'
            },
            stars: {
                type: Number,
                min: 0,
                max: 3,
                default: 0
            },
            destruction: {
                type: Number,
                min: 0,
                max: 100,
                default: 0
            },
            notes: String
        }]
    }],
    notes: String,
    createdBy: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create compound indices for efficient queries
warPlanSchema.index({ guildId: 1, clanTag: 1 });
warPlanSchema.index({ status: 1 });

const WarPlan = mongoose.model('WarPlan', warPlanSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plan')
        .setDescription('Plan and coordinate clan war attacks')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new war plan')
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
                .setName('assign')
                .setDescription('Assign a player to attack a base')
                .addIntegerOption(option =>
                    option.setName('target')
                        .setDescription('Target base number (1-50)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag to assign')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('priority')
                        .setDescription('Attack priority (1=first, 2=second)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(2))
                .addStringOption(option =>
                    option.setName('notes')
                        .setDescription('Notes for this assignment')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update an attack result')
                .addIntegerOption(option =>
                    option.setName('target')
                        .setDescription('Target base number (1-50)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag who attacked')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('stars')
                        .setDescription('Stars earned (0-3)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(3))
                .addIntegerOption(option =>
                    option.setName('destruction')
                        .setDescription('Destruction percentage (0-100)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Attack status')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Completed', value: 'completed' },
                            { name: 'Failed', value: 'failed' },
                            { name: 'Pending', value: 'pending' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current war plan'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear assignments for a target')
                .addIntegerOption(option =>
                    option.setName('target')
                        .setDescription('Target base number (1-50)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End the current war plan and archive it'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'War',

    manualDeferring: true,

    longDescription: 'Plan and coordinate clan war attacks. Create a war plan, assign attackers to enemy bases, update attack results, and view the overall plan. Helps organize war strategy and track attack assignments.',

    examples: [
        '/plan create opponent:EnemyClan opponent_tag:#ABC123',
        '/plan assign target:5 player_tag:#XYZ789 priority:1 notes:Hit with QC Hogs',
        '/plan update target:5 player_tag:#XYZ789 stars:3 destruction:100',
        '/plan view',
        '/plan clear target:5',
        '/plan end'
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
                case 'create':
                    await createWarPlan(interaction, linkedClan);
                    break;
                case 'assign':
                    await assignAttacker(interaction, linkedClan);
                    break;
                case 'update':
                    await updateAttackResult(interaction, linkedClan);
                    break;
                case 'view':
                    await viewWarPlan(interaction, linkedClan);
                    break;
                case 'clear':
                    await clearAssignment(interaction, linkedClan);
                    break;
                case 'end':
                    await endWarPlan(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in plan command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'war planning'));
        }
    },
};

/**
 * Create a new war plan
 */
async function createWarPlan(interaction, linkedClan) {
    const opponentName = interaction.options.getString('opponent');

    // Format opponent tag
    let opponentTag = interaction.options.getString('opponent_tag');
    if (!opponentTag.startsWith('#')) {
        opponentTag = '#' + opponentTag;
    }
    opponentTag = opponentTag.toUpperCase();

    // Check if there's already an active war plan
    const existingPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (existingPlan) {
        return interaction.editReply('There is already an active war plan. End the current plan with `/plan end` before creating a new one.');
    }

    // Calculate war duration (24 hours)
    const startTime = new Date();
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 24);

    // Create a unique war ID
    const warId = `${linkedClan.clanTag.replace('#', '')}-${opponentTag.replace('#', '')}-${Date.now()}`;

    // Try to get war data from API if available
    let enemyBases = [];
    try {
        // This would ideally use the getCurrentWar endpoint to get actual war data
        // For now, we'll create placeholder data based on the opponent clan info
        const opponentClan = await clashApiService.getClan(opponentTag);

        if (opponentClan && opponentClan.memberList) {
            // Sort members by descending town hall level (similar to how war map works)
            const sortedMembers = [...opponentClan.memberList].sort((a, b) => {
                if (b.townhallLevel !== a.townhallLevel) {
                    return b.townhallLevel - a.townhallLevel;
                }
                return b.trophies - a.trophies;
            });

            // Create base entries for each member (up to war size, typically 15, 30, or 50)
            enemyBases = sortedMembers.slice(0, 50).map((member, index) => ({
                opponentBaseNumber: index + 1,
                opponentName: member.name,
                opponentThLevel: member.townhallLevel,
                attackers: []
            }));
        }
    } catch (error) {
        console.error('Error getting opponent clan data:', error);
        // Continue with empty bases array if API fails
    }

    // Create placeholder bases if API failed
    if (enemyBases.length === 0) {
        // Create 15 placeholder bases (common war size)
        for (let i = 1; i <= 15; i++) {
            enemyBases.push({
                opponentBaseNumber: i,
                opponentName: `Enemy Base #${i}`,
                opponentThLevel: 0, // Unknown TH level
                attackers: []
            });
        }
    }

    // Create the war plan
    const warPlan = new WarPlan({
        guildId: interaction.guild.id,
        warId: warId,
        clanTag: linkedClan.clanTag,
        opponentTag: opponentTag,
        opponentName: opponentName,
        status: 'planning',
        startTime: startTime,
        endTime: endTime,
        assignments: enemyBases,
        createdBy: interaction.user.id
    });

    await warPlan.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Plan Created')
        .setDescription(`War plan created for war against ${opponentName} (${opponentTag})`)
        .addFields(
            { name: 'War Start', value: startTime.toLocaleString(), inline: true },
            { name: 'War End', value: endTime.toLocaleString(), inline: true },
            { name: 'Number of Bases', value: enemyBases.length.toString(), inline: true },
            { name: 'Next Steps', value: 'Use `/plan assign` to assign attackers to bases\nUse `/plan view` to see the current plan' }
        )
        .setFooter({ text: `Created by ${interaction.user.username}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Assign a player to attack a base
 */
async function assignAttacker(interaction, linkedClan) {
    const targetBase = interaction.options.getInteger('target');

    // Format player tag
    let playerTag = interaction.options.getString('player_tag');
    if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
    }
    playerTag = playerTag.toUpperCase();

    const priority = interaction.options.getInteger('priority') || 1;
    const notes = interaction.options.getString('notes') || '';

    // Find the active war plan
    const warPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (!warPlan) {
        return interaction.editReply('No active war plan found. Create one with `/plan create` first.');
    }

    // Check if the target exists
    const baseIndex = warPlan.assignments.findIndex(a => a.opponentBaseNumber === targetBase);
    if (baseIndex === -1) {
        return interaction.editReply(`No base with number ${targetBase} found in the war plan.`);
    }

    // Get player information
    let playerName = playerTag;
    let discordId = null;

    try {
        // Try to get player data from API
        const playerData = await clashApiService.getPlayer(playerTag);
        if (playerData) {
            playerName = playerData.name;

            // Check if player is linked to a Discord user
            const linkedUser = await User.findOne({ playerTag: playerTag });
            if (linkedUser) {
                discordId = linkedUser.discordId;
            }
        }
    } catch (error) {
        console.error('Error getting player data:', error);
        // Continue with tag as name if API fails
    }

    // Check if this player is already assigned to this base
    const existingAssignment = warPlan.assignments[baseIndex].attackers.findIndex(
        a => a.playerTag === playerTag && a.priority === priority
    );

    if (existingAssignment !== -1) {
        // Update existing assignment
        warPlan.assignments[baseIndex].attackers[existingAssignment].notes = notes;
        warPlan.assignments[baseIndex].attackers[existingAssignment].status = 'assigned';
    } else {
        // Add new assignment
        warPlan.assignments[baseIndex].attackers.push({
            playerTag: playerTag,
            playerName: playerName,
            discordId: discordId,
            priority: priority,
            status: 'assigned',
            stars: 0,
            destruction: 0,
            notes: notes
        });

        // Sort attackers by priority
        warPlan.assignments[baseIndex].attackers.sort((a, b) => a.priority - b.priority);
    }

    warPlan.updatedAt = new Date();
    await warPlan.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Attack Assignment Added')
        .setDescription(`${playerName} (${playerTag}) has been assigned to attack base #${targetBase}`)
        .addFields(
            { name: 'Target', value: `${warPlan.assignments[baseIndex].opponentName || `Base #${targetBase}`} (TH${warPlan.assignments[baseIndex].opponentThLevel || '?'})`, inline: true },
            { name: 'Priority', value: priority === 1 ? 'First attack' : 'Second attack', inline: true },
            { name: 'Notes', value: notes || 'No notes provided', inline: true }
        )
        .setFooter({ text: 'Use /plan view to see the full war plan' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Update an attack result
 */
async function updateAttackResult(interaction, linkedClan) {
    const targetBase = interaction.options.getInteger('target');

    // Format player tag
    let playerTag = interaction.options.getString('player_tag');
    if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
    }
    playerTag = playerTag.toUpperCase();

    const stars = interaction.options.getInteger('stars');
    const destruction = interaction.options.getInteger('destruction');
    const status = interaction.options.getString('status') || 'completed';

    // Find the active war plan
    const warPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (!warPlan) {
        return interaction.editReply('No active war plan found. Create one with `/plan create` first.');
    }

    // Check if the target exists
    const baseIndex = warPlan.assignments.findIndex(a => a.opponentBaseNumber === targetBase);
    if (baseIndex === -1) {
        return interaction.editReply(`No base with number ${targetBase} found in the war plan.`);
    }

    // Find the attacker in the assignments
    const attackerIndex = warPlan.assignments[baseIndex].attackers.findIndex(a => a.playerTag === playerTag);
    if (attackerIndex === -1) {
        return interaction.editReply(`${playerTag} is not assigned to attack base #${targetBase}. Assign them first with \`/plan assign\`.`);
    }

    // Update the attack result
    warPlan.assignments[baseIndex].attackers[attackerIndex].stars = stars;
    warPlan.assignments[baseIndex].attackers[attackerIndex].destruction = destruction;
    warPlan.assignments[baseIndex].attackers[attackerIndex].status = status;

    warPlan.updatedAt = new Date();
    await warPlan.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Attack Result Updated')
        .setDescription(`${warPlan.assignments[baseIndex].attackers[attackerIndex].playerName} (${playerTag}) attack on base #${targetBase} has been updated.`)
        .addFields(
            { name: 'Stars', value: '⭐'.repeat(stars) || '0 stars', inline: true },
            { name: 'Destruction', value: `${destruction}%`, inline: true },
            { name: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1), inline: true }
        )
        .setFooter({ text: 'Use /plan view to see the full war plan' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * View the current war plan
 */
async function viewWarPlan(interaction, linkedClan) {
    // Find the active war plan
    const warPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (!warPlan) {
        return interaction.editReply('No active war plan found. Create one with `/plan create` first.');
    }

    // Calculate war status
    const now = new Date();
    const warStatus = now < warPlan.startTime ? 'Preparation' :
        now < warPlan.endTime ? 'In Progress' : 'Ended';

    // Calculate summary statistics
    let totalAssignments = 0;
    let completedAttacks = 0;
    let totalStars = 0;
    let totalDestruction = 0;
    let unassignedBases = 0;

    warPlan.assignments.forEach(base => {
        if (base.attackers.length === 0) {
            unassignedBases++;
        }

        base.attackers.forEach(attacker => {
            totalAssignments++;

            if (attacker.status === 'completed') {
                completedAttacks++;
                totalStars += attacker.stars;
                totalDestruction += attacker.destruction;
            }
        });
    });

    const averageDestruction = completedAttacks > 0 ? totalDestruction / completedAttacks : 0;

    // Create main embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`War Plan: ${linkedClan.name} vs ${warPlan.opponentName}`)
        .setDescription(`Status: **${warStatus}**\nWar Time: ${warPlan.startTime.toLocaleString()} - ${warPlan.endTime.toLocaleString()}`)
        .addFields(
            { name: 'Summary', value:
                    `Total Bases: ${warPlan.assignments.length}\n` +
                    `Unassigned Bases: ${unassignedBases}\n` +
                    `Total Assignments: ${totalAssignments}\n` +
                    `Completed Attacks: ${completedAttacks}/${totalAssignments}\n` +
                    `Total Stars: ${totalStars}/${completedAttacks * 3}\n` +
                    `Average Destruction: ${averageDestruction.toFixed(1)}%`
            }
        )
        .setFooter({ text: `Created: ${warPlan.createdAt.toLocaleString()} • Updated: ${warPlan.updatedAt.toLocaleString()}` });

    // Add notes if present
    if (warPlan.notes) {
        embed.addFields({ name: 'War Notes', value: warPlan.notes });
    }

    // Create embeds for base assignments (split into groups for readability)
    const baseEmbeds = [];
    const basesPerEmbed = 5;

    for (let i = 0; i < warPlan.assignments.length; i += basesPerEmbed) {
        const baseGroup = warPlan.assignments.slice(i, i + basesPerEmbed);

        const baseEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`Bases ${i + 1} - ${Math.min(i + basesPerEmbed, warPlan.assignments.length)}`);

        let description = '';

        for (const base of baseGroup) {
            description += `**Base #${base.opponentBaseNumber}:** ${base.opponentName || 'Unknown'} (TH${base.opponentThLevel || '?'})\n`;

            if (base.attackers.length === 0) {
                description += '• No attackers assigned\n';
            } else {
                for (const attacker of base.attackers) {
                    const statusEmoji = getStatusEmoji(attacker.status);
                    const stars = attacker.stars > 0 ? ' ' + '⭐'.repeat(attacker.stars) : '';
                    const destruction = attacker.destruction > 0 ? ` (${attacker.destruction}%)` : '';
                    const priority = attacker.priority === 1 ? '1st' : '2nd';
                    const mention = attacker.discordId ? `<@${attacker.discordId}>` : attacker.playerName;

                    description += `• ${statusEmoji} ${priority}: ${mention}${stars}${destruction}\n`;

                    if (attacker.notes) {
                        description += `  > ${attacker.notes}\n`;
                    }
                }
            }

            description += '\n';
        }

        baseEmbed.setDescription(description);
        baseEmbeds.push(baseEmbed);
    }

    // Send embeds (main embed and first group)
    await interaction.editReply({ embeds: [embed, baseEmbeds[0]] });

    // Send additional embeds if needed
    for (let i = 1; i < baseEmbeds.length; i++) {
        await interaction.followUp({ embeds: [baseEmbeds[i]] });
    }
}

/**
 * Clear assignments for a target
 */
async function clearAssignment(interaction, linkedClan) {
    const targetBase = interaction.options.getInteger('target');

    // Find the active war plan
    const warPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (!warPlan) {
        return interaction.editReply('No active war plan found. Create one with `/plan create` first.');
    }

    // Check if the target exists
    const baseIndex = warPlan.assignments.findIndex(a => a.opponentBaseNumber === targetBase);
    if (baseIndex === -1) {
        return interaction.editReply(`No base with number ${targetBase} found in the war plan.`);
    }

    // Check if there are any assignments to clear
    if (warPlan.assignments[baseIndex].attackers.length === 0) {
        return interaction.editReply(`Base #${targetBase} doesn't have any attack assignments to clear.`);
    }

    // Store the number of assignments before clearing
    const assignmentCount = warPlan.assignments[baseIndex].attackers.length;

    // Clear the assignments
    warPlan.assignments[baseIndex].attackers = [];

    warPlan.updatedAt = new Date();
    await warPlan.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Attack Assignments Cleared')
        .setDescription(`Cleared ${assignmentCount} attack assignment(s) from base #${targetBase}.`)
        .setFooter({ text: 'Use /plan assign to add new assignments' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * End the current war plan
 */
async function endWarPlan(interaction, linkedClan) {
    // Find the active war plan
    const warPlan = await WarPlan.findOne({
        guildId: interaction.guild.id,
        status: { $ne: 'ended' }
    });

    if (!warPlan) {
        return interaction.editReply('No active war plan found.');
    }

    // Calculate summary statistics
    let totalAssignments = 0;
    let completedAttacks = 0;
    let totalStars = 0;
    let threeStarAttacks = 0;

    warPlan.assignments.forEach(base => {
        base.attackers.forEach(attacker => {
            totalAssignments++;

            if (attacker.status === 'completed') {
                completedAttacks++;
                totalStars += attacker.stars;

                if (attacker.stars === 3) {
                    threeStarAttacks++;
                }
            }
        });
    });

    // Mark the plan as ended
    warPlan.status = 'ended';
    warPlan.updatedAt = new Date();
    await warPlan.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('War Plan Ended')
        .setDescription(`War plan against ${warPlan.opponentName} has been ended and archived.`)
        .addFields(
            { name: 'War Duration', value: `${warPlan.startTime.toLocaleDateString()} - ${warPlan.endTime.toLocaleDateString()}`, inline: true },
            { name: 'Assignments', value: `${totalAssignments} total`, inline: true },
            { name: 'Completed Attacks', value: `${completedAttacks}/${totalAssignments}`, inline: true },
            { name: 'Stars Earned', value: `${totalStars} stars (${threeStarAttacks} three-stars)`, inline: true }
        )
        .setFooter({ text: 'Start a new war plan with /plan create' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Get emoji for attack status
 */
function getStatusEmoji(status) {
    switch (status) {
        case 'assigned': return '⏳'; // Assigned but not yet attacked
        case 'pending': return '⌛'; // Attack planned soon
        case 'completed': return '✅'; // Attack completed
        case 'failed': return '❌'; // Attack failed
        default: return '❓';
    }
}