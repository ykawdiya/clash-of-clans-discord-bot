// src/commands/war/warreminder.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

// Add this at the top of the file
const { getModel } = require('../../models/modelRegistry');

// Then, instead of:
// const Base = mongoose.model('Base', baseSchema);

// Use:
const Base = getModel('Base', baseSchema);

// Scheduled reminders storage (in-memory)
// In a production environment, consider using a database instead
const scheduledReminders = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warreminder')
        .setDescription('Set up war attack reminders')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check which players have not used their attacks yet'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remind')
                .setDescription('Send reminders to players who have not used their attacks'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('Schedule automatic reminders')
                .addIntegerOption(option =>
                    option.setName('hours')
                        .setDescription('Hours before war end to send reminder')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(23)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel scheduled reminders'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: 'War',

    longDescription: 'Set up and manage war attack reminders. Check which clan members have not used their attacks, send immediate reminders, or schedule automatic reminders for a specific time before war ends.',

    examples: [
        '/warreminder check',
        '/warreminder remind',
        '/warreminder schedule hours:4',
        '/warreminder cancel'
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

            // Get current war data
            const warData = await clashApiService.getCurrentWar(linkedClan.clanTag);

            // Check if clan is in war
            if (!warData || warData.state === 'notInWar') {
                return interaction.editReply(`Clan ${linkedClan.name} is not currently in a war.`);
            }

            // Check if war is in preparation day
            if (warData.state === 'preparation') {
                return interaction.editReply(`War is still in preparation day. Battle day hasn't started yet.`);
            }

            switch (subcommand) {
                case 'check':
                    await checkMissingAttacks(interaction, warData, linkedClan);
                    break;
                case 'remind':
                    await sendReminders(interaction, warData, linkedClan);
                    break;
                case 'schedule':
                    await scheduleReminder(interaction, warData, linkedClan);
                    break;
                case 'cancel':
                    await cancelReminder(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in warreminder command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'war reminder'));
        }
    },
};

/**
 * Check which clan members haven't used their attacks
 */
async function checkMissingAttacks(interaction, warData, linkedClan) {
    if (warData.state !== 'inWar' && warData.state !== 'warEnded') {
        return interaction.editReply('War is not in battle day yet.');
    }

    const missingAttacks = getMissingAttacks(warData);

    if (missingAttacks.length === 0) {
        return interaction.editReply('Everyone has used all their attacks! 🎉');
    }

    // Create an embed with missing attacks information
    const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('War Attacks Missing')
        .setDescription(`The following players still have attacks remaining in the current war:`)
        .setFooter({ text: `War ends: ${new Date(warData.endTime).toLocaleString()}` });

    // Group by number of missing attacks
    const grouped = missingAttacks.reduce((acc, player) => {
        if (!acc[player.attacksRemaining]) {
            acc[player.attacksRemaining] = [];
        }
        acc[player.attacksRemaining].push(player);
        return acc;
    }, {});

    // Add fields for each group
    Object.keys(grouped).sort((a, b) => b - a).forEach(attacksRemaining => {
        const players = grouped[attacksRemaining];
        const playerList = players.map(p => `${p.name} (TH${p.townhallLevel})`).join('\n');
        embed.addFields({
            name: `Missing ${attacksRemaining} ${attacksRemaining === '1' ? 'attack' : 'attacks'}`,
            value: playerList
        });
    });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Send reminders to players who haven't used their attacks
 */
async function sendReminders(interaction, warData, linkedClan) {
    if (warData.state !== 'inWar') {
        return interaction.editReply('War is not in battle day or has already ended.');
    }

    const missingAttacks = getMissingAttacks(warData);

    if (missingAttacks.length === 0) {
        return interaction.editReply('Everyone has used all their attacks! 🎉');
    }

    // Get all users who have linked their accounts
    const linkedUsers = await User.find({});

    // Map CoC tags to Discord IDs
    const playerMap = {};
    linkedUsers.forEach(user => {
        if (user.playerTag) {
            playerMap[user.playerTag] = user.discordId;
        }
    });

    // Track who we can and cannot remind
    let remindedCount = 0;
    const notLinked = [];

    // Send DMs to players with missing attacks
    for (const player of missingAttacks) {
        if (playerMap[player.tag]) {
            try {
                // Try to get the member
                const member = await interaction.guild.members.fetch(playerMap[player.tag]);

                // Create a DM embed
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('War Attack Reminder')
                    .setDescription(`You have ${player.attacksRemaining} attack(s) remaining in the current war!`)
                    .addFields({
                        name: 'War End Time',
                        value: new Date(warData.endTime).toLocaleString()
                    })
                    .setFooter({ text: `Message sent from ${interaction.guild.name}` });

                // Send the DM
                await member.send({ embeds: [embed] });
                remindedCount++;
            } catch (error) {
                console.error(`Failed to send reminder to ${player.name}:`, error);
                notLinked.push(`${player.name} (Discord DM failed)`);
            }
        } else {
            notLinked.push(`${player.name} (not linked)`);
        }
    }

    // Create a response embed
    const responseEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Attack Reminders')
        .setDescription(`Sent reminders to ${remindedCount} players.`);

    // Add not linked players if any
    if (notLinked.length > 0) {
        responseEmbed.addFields({
            name: 'Could not send reminders to',
            value: notLinked.join('\n')
        });
        responseEmbed.addFields({
            name: 'Tip',
            value: 'Ask these players to link their accounts using `/link` command to receive reminders.'
        });
    }

    return interaction.editReply({ embeds: [responseEmbed] });
}

/**
 * Schedule a reminder for later
 */
async function scheduleReminder(interaction, warData, linkedClan) {
    if (warData.state !== 'inWar') {
        return interaction.editReply('War is not in battle day or has already ended.');
    }

    const hours = interaction.options.getInteger('hours');

    // Calculate when to send the reminder
    const warEndTime = new Date(warData.endTime);
    const reminderTime = new Date(warEndTime.getTime() - (hours * 60 * 60 * 1000));

    // Check if the time has already passed
    if (reminderTime <= new Date()) {
        return interaction.editReply(`Cannot schedule a reminder ${hours} hours before war end - that time has already passed!`);
    }

    // Cancel any existing reminder for this guild
    if (scheduledReminders.has(interaction.guild.id)) {
        clearTimeout(scheduledReminders.get(interaction.guild.id).timeout);
    }

    // Calculate milliseconds until the reminder
    const timeUntilReminder = reminderTime.getTime() - Date.now();

    // Schedule the reminder
    const timeout = setTimeout(async () => {
        try {
            // Get fresh war data when the time comes
            const freshWarData = await clashApiService.getCurrentWar(linkedClan.clanTag);

            // Check if war is still going
            if (!freshWarData || freshWarData.state !== 'inWar') {
                console.log(`Scheduled reminder for ${linkedClan.name} cancelled - war has ended.`);
                return;
            }

            const missingAttacks = getMissingAttacks(freshWarData);

            if (missingAttacks.length === 0) {
                console.log(`Scheduled reminder for ${linkedClan.name} cancelled - all attacks used.`);
                return;
            }

            // Get the reminder channel
            const channel = await interaction.client.channels.fetch(
                linkedClan.settings.channels.warAnnouncements || interaction.channelId
            );

            // Create the reminder embed
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⚠️ War is ending soon! ⚠️')
                .setDescription(`War ends in ${hours} hour(s)! The following players still need to attack:`)
                .setFooter({ text: `War ends: ${warEndTime.toLocaleString()}` });

            // Group by number of missing attacks
            const grouped = missingAttacks.reduce((acc, player) => {
                if (!acc[player.attacksRemaining]) {
                    acc[player.attacksRemaining] = [];
                }
                acc[player.attacksRemaining].push(player);
                return acc;
            }, {});

            // Add fields for each group
            Object.keys(grouped).sort((a, b) => b - a).forEach(attacksRemaining => {
                const players = grouped[attacksRemaining];
                const playerList = players.map(p => `${p.name} (TH${p.townhallLevel})`).join('\n');
                embed.addFields({
                    name: `Missing ${attacksRemaining} ${attacksRemaining === '1' ? 'attack' : 'attacks'}`,
                    value: playerList
                });
            });

            // Send the reminder
            await channel.send({ embeds: [embed] });

            // Try to mention the players who have linked accounts
            const linkedUsers = await User.find({});
            const playerTags = missingAttacks.map(p => p.tag);

            const mentionableMembers = [];
            for (const user of linkedUsers) {
                if (user.playerTag && playerTags.includes(user.playerTag)) {
                    try {
                        const member = await interaction.guild.members.fetch(user.discordId);
                        mentionableMembers.push(`<@${member.id}>`);
                    } catch (error) {
                        console.error(`Could not fetch member for user ${user.discordId}:`, error);
                    }
                }
            }

            if (mentionableMembers.length > 0) {
                await channel.send(`Reminder for: ${mentionableMembers.join(' ')}`);
            }

            // Remove this reminder from the map
            scheduledReminders.delete(interaction.guild.id);

        } catch (error) {
            console.error('Error executing scheduled reminder:', error);
        }
    }, timeUntilReminder);

    // Store the timeout and information
    scheduledReminders.set(interaction.guild.id, {
        timeout,
        clanTag: linkedClan.clanTag,
        channelId: interaction.channelId,
        warEndTime: warEndTime,
        reminderTime: reminderTime
    });

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Reminder Scheduled')
        .setDescription(`A reminder will be sent ${hours} hour(s) before the war ends.`)
        .addFields({
            name: 'Reminder Time',
            value: reminderTime.toLocaleString()
        })
        .addFields({
            name: 'War End Time',
            value: warEndTime.toLocaleString()
        });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Cancel a scheduled reminder
 */
async function cancelReminder(interaction, linkedClan) {
    if (!scheduledReminders.has(interaction.guild.id)) {
        return interaction.editReply('No scheduled reminder found for this server.');
    }

    // Clear the timeout
    clearTimeout(scheduledReminders.get(interaction.guild.id).timeout);

    // Get reminder info for the response
    const reminderInfo = scheduledReminders.get(interaction.guild.id);

    // Remove from the map
    scheduledReminders.delete(interaction.guild.id);

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Reminder Cancelled')
        .setDescription(`The scheduled reminder has been cancelled.`)
        .addFields({
            name: 'Cancelled Reminder Time',
            value: reminderInfo.reminderTime.toLocaleString()
        });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Helper function to get players with missing attacks
 */
function getMissingAttacks(warData) {
    const missingAttacks = [];

    if (!warData.clan.members) {
        return missingAttacks;
    }

    for (const member of warData.clan.members) {
        // Calculate remaining attacks
        const attacksUsed = member.attacks ? member.attacks.length : 0;
        const attacksRemaining = 2 - attacksUsed;

        if (attacksRemaining > 0) {
            missingAttacks.push({
                name: member.name,
                tag: member.tag,
                townhallLevel: member.townhallLevel,
                attacksUsed,
                attacksRemaining
            });
        }
    }

    return missingAttacks;
}