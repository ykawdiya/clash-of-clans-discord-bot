// src/commands/events/event.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a schema for clan events
const clanEventSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    eventId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    description: String,
    type: {
        type: String,
        enum: ['war', 'raid', 'practice', 'friendly', 'tournament', 'other'],
        default: 'other'
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: Date,
    location: String,
    organizer: {
        discordId: String,
        name: String
    },
    participants: [{
        discordId: String,
        name: String,
        playerTag: String,
        status: {
            type: String,
            enum: ['attending', 'tentative', 'declined'],
            default: 'attending'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    maxParticipants: Number,
    remindersSent: {
        type: Array,
        default: []
    },
    channelId: String,
    messageId: String,
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
clanEventSchema.index({ guildId: 1, startTime: 1 });
clanEventSchema.index({ guildId: 1, 'organizer.discordId': 1 });

const ClanEvent = mongoose.model('ClanEvent', clanEventSchema);

// Set up a scheduler for event reminders (run on bot startup)
let reminderInterval = null;

function startReminderSystem() {
    // Clear any existing interval
    if (reminderInterval) {
        clearInterval(reminderInterval);
    }

    // Check for events every 5 minutes
    reminderInterval = setInterval(async () => {
        try {
            await checkUpcomingEvents();
        } catch (error) {
            console.error('Error checking upcoming events:', error);
        }
    }, 5 * 60 * 1000); // 5 minutes

    console.log('Event reminder system started');
}

async function checkUpcomingEvents() {
    const now = new Date();

    // Find events that start in the next hour or 24 hours
    const upcomingEvents = await ClanEvent.find({
        startTime: {
            $gt: now,
            $lt: new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
        }
    });

    for (const event of upcomingEvents) {
        const timeUntilEvent = event.startTime.getTime() - now.getTime();
        const hoursUntilEvent = timeUntilEvent / (1000 * 60 * 60);

        // Send 1-hour reminder
        if (hoursUntilEvent <= 1 && !event.remindersSent.includes('1hour')) {
            await sendEventReminder(event, '1hour');
        }
        // Send 24-hour reminder
        else if (hoursUntilEvent <= 24 && !event.remindersSent.includes('24hour')) {
            await sendEventReminder(event, '24hour');
        }
    }
}

async function sendEventReminder(event, reminderType) {
    try {
        // Check if we have a valid channel ID
        if (!event.channelId) return;

        // Get the client - updated approach
        const client = require('../../index').client;
        if (!client) {
            console.error('Unable to access client instance');
            return;
        }

        // Rest of the function remains the same
        const channel = await client.channels.fetch(event.channelId).catch(err => null);
        if (!channel) return;

        // Create reminder embed
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle(`Reminder: ${event.title}`)
            .setDescription(`This event starts ${reminderType === '1hour' ? 'in about 1 hour' : 'tomorrow'}!`)
            .addFields(
                { name: 'Time', value: event.startTime.toLocaleString(), inline: true },
                { name: 'Participants', value: `${event.participants.length}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`, inline: true }
            )
            .setFooter({ text: `Event ID: ${event.eventId}` });

        // Add mentions for participants
        let mentionString = '';

        for (const participant of event.participants) {
            if (participant.status === 'attending' && participant.discordId) {
                mentionString += `<@${participant.discordId}> `;
            }
        }

        // Send the reminder
        await channel.send({
            content: `${mentionString}\n**EVENT REMINDER**`,
            embeds: [embed]
        });

        // Update the event to mark this reminder as sent
        event.remindersSent.push(reminderType);
        await event.save();

        console.log(`Sent ${reminderType} reminder for event ${event.eventId}`);
    } catch (error) {
        console.error(`Error sending event reminder for ${event.eventId}:`, error);
    }
}

// Start the reminder system when this module is loaded
startReminderSystem();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Create and manage clan events')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new clan event')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Title of the event')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('date')
                        .setDescription('Date of the event (YYYY-MM-DD)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Time of the event (HH:MM in 24-hour format)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of event')
                        .setRequired(true)
                        .addChoices(
                            { name: 'War', value: 'war' },
                            { name: 'Raid Weekend', value: 'raid' },
                            { name: 'Practice War', value: 'practice' },
                            { name: 'Friendly Challenge', value: 'friendly' },
                            { name: 'Tournament', value: 'tournament' },
                            { name: 'Other', value: 'other' }
                        ))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description of the event')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('duration')
                        .setDescription('Duration in hours')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max_participants')
                        .setDescription('Maximum number of participants')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List upcoming clan events'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get detailed information about an event')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Event ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join an event')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Event ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Your attendance status')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Attending', value: 'attending' },
                            { name: 'Tentative', value: 'tentative' },
                            { name: 'Declined', value: 'declined' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave an event')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Event ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel an event')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Event ID')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an event')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Event ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('New title')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('date')
                        .setDescription('New date (YYYY-MM-DD)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('New time (HH:MM in 24-hour format)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('New description')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('duration')
                        .setDescription('New duration in hours')
                        .setRequired(false))),

    category: 'Events',

    manualDeferring: true,

    longDescription: 'Create and manage clan events such as war practice sessions, friendly challenges, tournaments, and more. Schedule events, track participation, and send reminders to participants.',

    examples: [
        '/event create title:War Practice date:2023-09-15 time:20:00 type:practice',
        '/event list',
        '/event info id:ABC123',
        '/event join id:ABC123',
        '/event leave id:ABC123',
        '/event cancel id:ABC123'
    ],

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await createEvent(interaction);
                    break;
                case 'list':
                    await listEvents(interaction);
                    break;
                case 'info':
                    await getEventInfo(interaction);
                    break;
                case 'join':
                    await joinEvent(interaction);
                    break;
                case 'leave':
                    await leaveEvent(interaction);
                    break;
                case 'cancel':
                    await cancelEvent(interaction);
                    break;
                case 'edit':
                    await editEvent(interaction);
                    break;
                default:
                    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in event command:', error);
            return interaction.reply(ErrorHandler.formatError(error, 'event management'));
        }
    },
};

/**
 * Create a new clan event
 */
async function createEvent(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title');
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');
    const type = interaction.options.getString('type');
    const description = interaction.options.getString('description') || 'No description provided';
    const duration = interaction.options.getInteger('duration') || 1;
    const maxParticipants = interaction.options.getInteger('max_participants') || null;

    // Validate date and time
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    const startTime = new Date(dateTimeStr);

    if (isNaN(startTime.getTime())) {
        return interaction.editReply('Invalid date or time format. Please use YYYY-MM-DD for date and HH:MM for time.');
    }

    // Calculate end time
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + duration);

    // Check if the event is in the past
    const now = new Date();
    if (startTime < now) {
        return interaction.editReply('Cannot create an event in the past. Please choose a future date and time.');
    }

    // Generate a unique event ID
    const eventId = generateEventId();

    // Get player tag if user has linked their account
    let playerTag = null;
    const linkedUser = await User.findOne({ discordId: interaction.user.id });
    if (linkedUser && linkedUser.playerTag) {
        playerTag = linkedUser.playerTag;
    }

    // Create event
    const event = new ClanEvent({
        guildId: interaction.guild.id,
        eventId: eventId,
        title: title,
        description: description,
        type: type,
        startTime: startTime,
        endTime: endTime,
        organizer: {
            discordId: interaction.user.id,
            name: interaction.user.username
        },
        participants: [{
            discordId: interaction.user.id,
            name: interaction.user.username,
            playerTag: playerTag,
            status: 'attending'
        }],
        maxParticipants: maxParticipants,
        channelId: interaction.channel.id
    });

    await event.save();

    // Create event announcement
    const embed = createEventEmbed(event);

    // Create action row with buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`join_${eventId}`)
                .setLabel('Join')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`tentative_${eventId}`)
                .setLabel('Tentative')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('❓'),
            new ButtonBuilder()
                .setCustomId(`decline_${eventId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌'),
            new ButtonBuilder()
                .setCustomId(`info_${eventId}`)
                .setLabel('Details')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('ℹ️')
        );

    const announcementMessage = await interaction.editReply({
        content: `Event created! ID: \`${eventId}\``,
        embeds: [embed],
        components: [actionRow]
    });

    // Save message ID for later updates
    event.messageId = announcementMessage.id;
    await event.save();

    // Set up reminder for the event (30 minutes before)
    const reminderTime = new Date(startTime);
    reminderTime.setMinutes(reminderTime.getMinutes() - 30);

    const timeUntilReminder = reminderTime.getTime() - Date.now();
    if (timeUntilReminder > 0) {
        setTimeout(async () => {
            try {
                // Reload the event to get the latest participants
                const updatedEvent = await ClanEvent.findOne({ eventId: eventId });
                if (!updatedEvent) return;

                // Create reminder embed
                const reminderEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`Event Starting Soon: ${updatedEvent.title}`)
                    .setDescription(`This event will begin in 30 minutes!\n\n${updatedEvent.description}`)
                    .addFields(
                        { name: 'Time', value: updatedEvent.startTime.toLocaleString(), inline: true },
                        { name: 'Type', value: formatEventType(updatedEvent.type), inline: true },
                        { name: 'Participants', value: `${updatedEvent.participants.length}${updatedEvent.maxParticipants ? `/${updatedEvent.maxParticipants}` : ''}`, inline: true }
                    )
                    .setFooter({ text: `Event ID: ${updatedEvent.eventId}` });

                // Add mentions for participants
                let mentionString = '';

                for (const participant of updatedEvent.participants) {
                    if (participant.status === 'attending' && participant.discordId) {
                        mentionString += `<@${participant.discordId}> `;
                    }
                }

                // Send the reminder
                await interaction.channel.send({
                    content: `${mentionString}\n**EVENT REMINDER**`,
                    embeds: [reminderEmbed]
                });

            } catch (error) {
                console.error('Error sending event reminder:', error);
            }
        }, timeUntilReminder);
    }
}

/**
 * List upcoming clan events
 */
async function listEvents(interaction) {
    await interaction.deferReply();

    const now = new Date();

    // Find upcoming events for this guild
    const events = await ClanEvent.find({
        guildId: interaction.guild.id,
        startTime: { $gt: now }
    }).sort({ startTime: 1 });

    if (events.length === 0) {
        return interaction.editReply('No upcoming events found. Create one with `/event create`!');
    }

    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Upcoming Clan Events')
        .setDescription(`There are ${events.length} upcoming events`)
        .setFooter({ text: 'Use /event info <id> to see more details about an event' });

    // Group events by date
    const eventsByDate = {};

    for (const event of events) {
        const dateStr = event.startTime.toLocaleDateString();

        if (!eventsByDate[dateStr]) {
            eventsByDate[dateStr] = [];
        }

        eventsByDate[dateStr].push(event);
    }

    // Add fields for each date
    for (const [date, dateEvents] of Object.entries(eventsByDate)) {
        let fieldValue = '';

        for (const event of dateEvents) {
            const timeStr = event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const participants = event.participants.filter(p => p.status === 'attending').length;
            const maxPart = event.maxParticipants ? `/${event.maxParticipants}` : '';

            fieldValue += `• **${event.title}** (${formatEventType(event.type)}) at ${timeStr}\n`;
            fieldValue += `  ID: \`${event.eventId}\` • Participants: ${participants}${maxPart}\n\n`;
        }

        embed.addFields({ name: date, value: fieldValue.trim() });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Get detailed information about an event
 */
async function getEventInfo(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getString('id');

    // Find the event
    const event = await ClanEvent.findOne({
        guildId: interaction.guild.id,
        eventId: eventId
    });

    if (!event) {
        return interaction.editReply(`Event with ID \`${eventId}\` not found.`);
    }

    // Create embed with detailed info
    const embed = createEventEmbed(event, true);

    // Create action row with buttons
    const isParticipant = event.participants.some(p => p.discordId === interaction.user.id && p.status === 'attending');
    const isOrganizer = event.organizer.discordId === interaction.user.id;
    const now = new Date();
    const isPast = event.startTime < now;

    const actionRow = new ActionRowBuilder();

    if (!isPast) {
        if (!isParticipant) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`join_${eventId}`)
                    .setLabel('Join')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );
        } else {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`leave_${eventId}`)
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`tentative_${eventId}`)
                .setLabel('Tentative')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('❓')
        );

        if (isOrganizer) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`edit_${eventId}`)
                    .setLabel('Edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✏️'),
                new ButtonBuilder()
                    .setCustomId(`cancel_${eventId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🚫')
            );
        }
    }

    if (actionRow.components.length > 0) {
        return interaction.editReply({ embeds: [embed], components: [actionRow] });
    } else {
        return interaction.editReply({ embeds: [embed] });
    }
}

/**
 * Join an event
 */
async function joinEvent(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getString('id');
    const status = interaction.options.getString('status') || 'attending';

    // Find the event
    const event = await ClanEvent.findOne({
        guildId: interaction.guild.id,
        eventId: eventId
    });

    if (!event) {
        return interaction.editReply(`Event with ID \`${eventId}\` not found.`);
    }

    // Check if the event is in the past
    const now = new Date();
    if (event.startTime < now) {
        return interaction.editReply('This event has already started or ended.');
    }

    // Check if the event is full (only for attending status)
    if (status === 'attending' && event.maxParticipants) {
        const attendees = event.participants.filter(p => p.status === 'attending').length;
        if (attendees >= event.maxParticipants) {
            return interaction.editReply('Sorry, this event is full. You can still mark yourself as tentative.');
        }
    }

    // Get player tag if user has linked their account
    let playerTag = null;
    const linkedUser = await User.findOne({ discordId: interaction.user.id });
    if (linkedUser && linkedUser.playerTag) {
        playerTag = linkedUser.playerTag;
    }

    // Check if user is already in the participants list
    const participantIndex = event.participants.findIndex(p => p.discordId === interaction.user.id);

    if (participantIndex !== -1) {
        // Update existing participant status
        event.participants[participantIndex].status = status;
    } else {
        // Add new participant
        event.participants.push({
            discordId: interaction.user.id,
            name: interaction.user.username,
            playerTag: playerTag,
            status: status
        });
    }

    event.updatedAt = new Date();
    await event.save();

    // Try to update the original message if possible
    if (event.channelId && event.messageId) {
        try {
            const channel = await interaction.guild.channels.fetch(event.channelId);
            const message = await channel.messages.fetch(event.messageId);

            await message.edit({
                embeds: [createEventEmbed(event)],
                components: message.components
            });
        } catch (error) {
            console.error('Error updating event message:', error);
            // Continue even if updating the message fails
        }
    }

    // Create response embed
    const statusText = status === 'attending' ? 'joined' : (status === 'tentative' ? 'marked as tentative for' : 'declined');

    const embed = new EmbedBuilder()
        .setColor(status === 'attending' ? '#00ff00' : (status === 'tentative' ? '#3498db' : '#e74c3c'))
        .setTitle(`You've ${statusText} the event`)
        .setDescription(`Event: **${event.title}**`)
        .addFields(
            { name: 'Time', value: event.startTime.toLocaleString(), inline: true },
            { name: 'Participants', value: `${event.participants.filter(p => p.status === 'attending').length}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`, inline: true }
        )
        .setFooter({ text: `Event ID: ${event.eventId}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Leave an event
 */
async function leaveEvent(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getString('id');

    // Find the event
    const event = await ClanEvent.findOne({
        guildId: interaction.guild.id,
        eventId: eventId
    });

    if (!event) {
        return interaction.editReply(`Event with ID \`${eventId}\` not found.`);
    }

    // Check if the event is in the past
    const now = new Date();
    if (event.startTime < now) {
        return interaction.editReply('This event has already started or ended.');
    }

    // Check if user is in the participants list
    const participantIndex = event.participants.findIndex(p => p.discordId === interaction.user.id);

    if (participantIndex === -1) {
        return interaction.editReply('You are not currently signed up for this event.');
    }

    // Remove participant
    event.participants.splice(participantIndex, 1);

    event.updatedAt = new Date();
    await event.save();

    // Try to update the original message if possible
    if (event.channelId && event.messageId) {
        try {
            const channel = await interaction.guild.channels.fetch(event.channelId);
            const message = await channel.messages.fetch(event.messageId);

            await message.edit({
                embeds: [createEventEmbed(event)],
                components: message.components
            });
        } catch (error) {
            console.error('Error updating event message:', error);
            // Continue even if updating the message fails
        }
    }

    // Create response embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('You\'ve left the event')
        .setDescription(`You have been removed from the event: **${event.title}**`)
        .addFields(
            { name: 'Time', value: event.startTime.toLocaleString(), inline: true },
            { name: 'Participants', value: `${event.participants.filter(p => p.status === 'attending').length}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`, inline: true }
        )
        .setFooter({ text: `Event ID: ${event.eventId}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Cancel an event
 */
async function cancelEvent(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getString('id');

    // Find the event
    const event = await ClanEvent.findOne({
        guildId: interaction.guild.id,
        eventId: eventId
    });

    if (!event) {
        return interaction.editReply(`Event with ID \`${eventId}\` not found.`);
    }

    // Check if user is the organizer
    if (event.organizer.discordId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        return interaction.editReply('Only the event organizer or moderators can cancel this event.');
    }

    // Store event details for notification
    const eventTitle = event.title;
    const eventTime = event.startTime;
    const participants = [...event.participants];

    // Delete the event
    await ClanEvent.deleteOne({ eventId: eventId });

    // Try to update the original message if possible
    if (event.channelId && event.messageId) {
        try {
            const channel = await interaction.guild.channels.fetch(event.channelId);
            const message = await channel.messages.fetch(event.messageId);

            // Create cancelled embed
            const cancelledEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle(`Event Cancelled: ${eventTitle}`)
                .setDescription(`This event has been cancelled by ${interaction.user.username}.`)
                .addFields(
                    { name: 'Original Time', value: eventTime.toLocaleString() }
                )
                .setFooter({ text: `Event ID: ${eventId}` });

            await message.edit({
                embeds: [cancelledEmbed],
                components: []
            });
        } catch (error) {
            console.error('Error updating event message:', error);
            // Continue even if updating the message fails
        }
    }

    // Notify participants
    let notificationContent = '';

    for (const participant of participants) {
        if (participant.status === 'attending' || participant.status === 'tentative') {
            notificationContent += `<@${participant.discordId}> `;
        }
    }

    if (notificationContent) {
        const notificationEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('Event Cancelled')
            .setDescription(`The event **${eventTitle}** scheduled for ${eventTime.toLocaleString()} has been cancelled by ${interaction.user.username}.`);

        await interaction.channel.send({
            content: notificationContent,
            embeds: [notificationEmbed]
        });
    }

    // Create response embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Event Cancelled')
        .setDescription(`The event **${eventTitle}** has been cancelled.`)
        .setFooter({ text: `Event ID: ${eventId}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Edit an event
 */
async function editEvent(interaction) {
    await interaction.deferReply();

    const eventId = interaction.options.getString('id');
    const newTitle = interaction.options.getString('title');
    const newDateStr = interaction.options.getString('date');
    const newTimeStr = interaction.options.getString('time');
    const newDescription = interaction.options.getString('description');
    const newDuration = interaction.options.getInteger('duration');

    // Find the event
    const event = await ClanEvent.findOne({
        guildId: interaction.guild.id,
        eventId: eventId
    });

    if (!event) {
        return interaction.editReply(`Event with ID \`${eventId}\` not found.`);
    }

    // Check if user is the organizer
    if (event.organizer.discordId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        return interaction.editReply('Only the event organizer or moderators can edit this event.');
    }

    // Check if the event is in the past
    const now = new Date();
    if (event.startTime < now) {
        return interaction.editReply('Cannot edit an event that has already started or ended.');
    }

    let newStartTime = new Date(event.startTime);
    let newEndTime = new Date(event.endTime);

    // Update event properties if provided
    if (newDateStr || newTimeStr) {
        // If either date or time is provided but not both, use the existing value for the missing one
        const dateToUse = newDateStr || event.startTime.toISOString().split('T')[0];
        const timeToUse = newTimeStr || event.startTime.toTimeString().split(' ')[0].substring(0, 5);

        const dateTimeStr = `${dateToUse}T${timeToUse}:00`;
        newStartTime = new Date(dateTimeStr);

        if (isNaN(newStartTime.getTime())) {
            return interaction.editReply('Invalid date or time format. Please use YYYY-MM-DD for date and HH:MM for time.');
        }

        // Check if the new time is in the past
        if (newStartTime < now) {
            return interaction.editReply('Cannot set an event time in the past. Please choose a future date and time.');
        }

        // Update end time based on the new start time and either provided or existing duration
        const durationHours = newDuration || (event.endTime - event.startTime) / (1000 * 60 * 60);
        newEndTime = new Date(newStartTime);
        newEndTime.setHours(newEndTime.getHours() + durationHours);
    } else if (newDuration) {
        // Only duration was changed
        newEndTime = new Date(newStartTime);
        newEndTime.setHours(newEndTime.getHours() + newDuration);
    }

    // Update the event
    if (newTitle) event.title = newTitle;
    if (newDescription) event.description = newDescription;
    if (newDateStr || newTimeStr) {
        event.startTime = newStartTime;
        event.endTime = newEndTime;
    } else if (newDuration) {
        event.endTime = newEndTime;
    }

    event.updatedAt = new Date();
    await event.save();

    // Try to update the original message if possible
    if (event.channelId && event.messageId) {
        try {
            const channel = await interaction.guild.channels.fetch(event.channelId);
            const message = await channel.messages.fetch(event.messageId);

            await message.edit({
                embeds: [createEventEmbed(event)],
                components: message.components
            });
        } catch (error) {
            console.error('Error updating event message:', error);
            // Continue even if updating the message fails
        }
    }

    // Notify participants of the changes
    let notificationContent = '';

    for (const participant of event.participants) {
        if (participant.status === 'attending' || participant.status === 'tentative') {
            notificationContent += `<@${participant.discordId}> `;
        }
    }

    if (notificationContent) {
        const changesText = [];
        if (newTitle) changesText.push(`Title: ${newTitle}`);
        if (newDateStr || newTimeStr) changesText.push(`Time: ${newStartTime.toLocaleString()}`);
        if (newDescription) changesText.push(`Description updated`);
        if (newDuration) changesText.push(`Duration: ${newDuration} hours`);

        const notificationEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('Event Updated')
            .setDescription(`The event **${event.title}** has been updated by ${interaction.user.username}.`)
            .addFields({ name: 'Changes', value: changesText.join('\n') })
            .setFooter({ text: `Event ID: ${event.eventId}` });

        await interaction.channel.send({
            content: notificationContent,
            embeds: [notificationEmbed]
        });
    }

    // Create response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Event Updated')
        .setDescription(`The event **${event.title}** has been updated.`)
        .addFields(
            { name: 'Time', value: event.startTime.toLocaleString(), inline: true },
            { name: 'Participants', value: `${event.participants.filter(p => p.status === 'attending').length}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`, inline: true }
        )
        .setFooter({ text: `Event ID: ${event.eventId}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Create an event embed
 */
function createEventEmbed(event, detailed = false) {
    const now = new Date();
    const isPast = event.startTime < now;

    // Count participants by status
    const attending = event.participants.filter(p => p.status === 'attending').length;
    const tentative = event.participants.filter(p => p.status === 'tentative').length;
    const declined = event.participants.filter(p => p.status === 'declined').length;

    // Calculate duration
    const durationMs = event.endTime - event.startTime;
    const durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10;

    const embed = new EmbedBuilder()
        .setColor(isPast ? '#95a5a6' : typeColors[event.type] || '#3498db')
        .setTitle(event.title)
        .setDescription(event.description)
        .addFields(
            { name: 'Time', value: event.startTime.toLocaleString(), inline: true },
            { name: 'Type', value: formatEventType(event.type), inline: true },
            { name: 'Duration', value: `${durationHours} hours`, inline: true },
            { name: 'Status', value: isPast ? 'Ended' : 'Upcoming', inline: true },
            { name: 'Participants', value: `${attending}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`, inline: true },
            { name: 'Organizer', value: `<@${event.organizer.discordId}>`, inline: true }
        )
        .setFooter({ text: `Event ID: ${event.eventId}` });

    // Add detailed participant list if requested
    if (detailed) {
        // Add attending participants
        const attendingParticipants = event.participants.filter(p => p.status === 'attending');
        if (attendingParticipants.length > 0) {
            let attendingText = '';
            for (const participant of attendingParticipants) {
                attendingText += `<@${participant.discordId}> ${participant === event.organizer ? '(Organizer)' : ''}\n`;
            }
            embed.addFields({ name: '✅ Attending', value: attendingText });
        }

        // Add tentative participants
        const tentativeParticipants = event.participants.filter(p => p.status === 'tentative');
        if (tentativeParticipants.length > 0) {
            let tentativeText = '';
            for (const participant of tentativeParticipants) {
                tentativeText += `<@${participant.discordId}>\n`;
            }
            embed.addFields({ name: '❓ Tentative', value: tentativeText });
        }

        // Add declined participants
        const declinedParticipants = event.participants.filter(p => p.status === 'declined');
        if (declinedParticipants.length > 0) {
            let declinedText = '';
            for (const participant of declinedParticipants) {
                declinedText += `<@${participant.discordId}>\n`;
            }
            embed.addFields({ name: '❌ Declined', value: declinedText });
        }
    } else {
        // Just show counts for each status
        embed.addFields({
            name: 'Responses',
            value: `✅ Attending: ${attending}\n❓ Tentative: ${tentative}\n❌ Declined: ${declined}`,
            inline: false
        });
    }

    return embed;
}

/**
 * Generate a unique event ID
 */
function generateEventId() {
    // Generate a random event ID (6 characters)
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';

    for (let i = 0; i < 6; i++) {
        id += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return id;
}

/**
 * Format event type for display
 */
function formatEventType(type) {
    const typeMap = {
        'war': 'War',
        'raid': 'Raid Weekend',
        'practice': 'Practice War',
        'friendly': 'Friendly Challenge',
        'tournament': 'Tournament',
        'other': 'Other'
    };

    return typeMap[type] || type;
}

/**
 * Color mapping for event types
 */
const typeColors = {
    'war': '#e74c3c',
    'raid': '#9b59b6',
    'practice': '#e67e22',
    'friendly': '#2ecc71',
    'tournament': '#f1c40f',
    'other': '#3498db'
};