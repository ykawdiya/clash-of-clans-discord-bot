// src/commands/recruitment/recruit.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const mongoose = require('mongoose');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a schema for recruitment applications
const recruitmentSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    applicantId: {
        type: String,
        required: true
    },
    applicantTag: {
        type: String,
        required: true
    },
    applicantName: String,
    townHallLevel: Number,
    heroLevels: {
        barbarian: Number,
        archer: Number,
        warden: Number,
        royal: Number,
        champion: Number
    },
    warStars: Number,
    preferredAttackStrategy: String,
    trophies: Number,
    donations: Number,
    experience: String,
    additionalInfo: String,
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'waitlisted'],
        default: 'pending'
    },
    reviewedBy: String,
    reviewNotes: String,
    applicationDate: {
        type: Date,
        default: Date.now
    },
    reviewDate: Date,
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create compound indices for efficient queries
recruitmentSchema.index({ guildId: 1, applicantId: 1 });
recruitmentSchema.index({ guildId: 1, status: 1 });

const Recruitment = mongoose.model('Recruitment', recruitmentSchema);

// Define a schema for recruitment settings
const recruitmentSettingsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    minTownHallLevel: {
        type: Number,
        default: 10
    },
    requireWarExperience: {
        type: Boolean,
        default: true
    },
    applicationChannelId: String,
    reviewChannelId: String,
    alertRoleId: String,
    welcomeMessage: String,
    requirements: String,
    autoRejection: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const RecruitmentSettings = mongoose.model('RecruitmentSettings', recruitmentSettingsSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recruit')
        .setDescription('Manage clan recruitment')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the recruitment system')
                .addChannelOption(option =>
                    option.setName('application_channel')
                        .setDescription('Channel where users can apply to join the clan')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('review_channel')
                        .setDescription('Channel where admins review applications')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('alert_role')
                        .setDescription('Role to ping when new applications are received')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('min_th_level')
                        .setDescription('Minimum TH level required')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(15))
                .addBooleanOption(option =>
                    option.setName('require_war')
                        .setDescription('Require war experience')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('Set the welcome message for recruitment')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Welcome message for the recruitment channel')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('requirements')
                .setDescription('Set clan requirements')
                .addStringOption(option =>
                    option.setName('requirements')
                        .setDescription('Clan requirements for joining')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('apply')
                .setDescription('Apply to join the clan'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('review')
                .setDescription('Review pending applications'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approve a recruitment application')
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag of the applicant')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('notes')
                        .setDescription('Notes about the approval')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reject')
                .setDescription('Reject a recruitment application')
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag of the applicant')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for rejection')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('waitlist')
                .setDescription('Waitlist a recruitment application')
                .addStringOption(option =>
                    option.setName('player_tag')
                        .setDescription('Player tag of the applicant')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('notes')
                        .setDescription('Notes about the waitlist decision')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show recruitment statistics')),

    category: 'Recruitment',

    manualDeferring: true,

    longDescription: 'Manage clan recruitment with a complete application system. Set up recruitment channels, customize requirements, review applications, and track recruitment statistics.',

    examples: [
        '/recruit setup application_channel:#join-requests review_channel:#recruitment min_th_level:12',
        '/recruit welcome message:Welcome to our clan! Please use the /recruit apply command to join.',
        '/recruit requirements requirements:TH12+, 50+ war stars per season, 5000+ donations monthly',
        '/recruit apply',
        '/recruit review',
        '/recruit approve player_tag:#ABC123',
        '/recruit stats'
    ],

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            // Find linked clan for this Discord server
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan && subcommand !== 'apply') {
                return interaction.reply({ content: "This server doesn't have a linked clan. Use `/setclan` first.", ephemeral: true });
            }

            // Check permissions for admin commands
            const adminCommands = ['setup', 'welcome', 'requirements', 'approve', 'reject', 'waitlist'];
            if (adminCommands.includes(subcommand)) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    return interaction.reply({
                        content: 'You need the Manage Messages permission to use this command.',
                        ephemeral: true
                    });
                }
            }

            switch (subcommand) {
                case 'setup':
                    await setupRecruitment(interaction, linkedClan);
                    break;
                case 'welcome':
                    await setWelcomeMessage(interaction, linkedClan);
                    break;
                case 'requirements':
                    await setRequirements(interaction, linkedClan);
                    break;
                case 'apply':
                    await applyToClan(interaction);
                    break;
                case 'review':
                    await reviewApplications(interaction, linkedClan);
                    break;
                case 'approve':
                    await handleApplication(interaction, linkedClan, 'approved');
                    break;
                case 'reject':
                    await handleApplication(interaction, linkedClan, 'rejected');
                    break;
                case 'waitlist':
                    await handleApplication(interaction, linkedClan, 'waitlisted');
                    break;
                case 'stats':
                    await showRecruitmentStats(interaction, linkedClan);
                    break;
                default:
                    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in recruit command:', error);
            return interaction.reply(ErrorHandler.formatError(error, 'recruitment'));
        }
    },
};

/**
 * Set up the recruitment system
 */
async function setupRecruitment(interaction, linkedClan) {
    await interaction.deferReply();

    const applicationChannel = interaction.options.getChannel('application_channel');
    const reviewChannel = interaction.options.getChannel('review_channel');
    const alertRole = interaction.options.getRole('alert_role');
    const minThLevel = interaction.options.getInteger('min_th_level') || 10;
    const requireWar = interaction.options.getBoolean('require_war') ?? true;

    // Check if channels are text channels
    if (applicationChannel.type !== 0) { // 0 is GUILD_TEXT
        return interaction.editReply('Application channel must be a text channel.');
    }

    if (reviewChannel.type !== 0) {
        return interaction.editReply('Review channel must be a text channel.');
    }

    // Check if settings already exist
    let settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (settings) {
        // Update existing settings
        settings.applicationChannelId = applicationChannel.id;
        settings.reviewChannelId = reviewChannel.id;
        settings.alertRoleId = alertRole ? alertRole.id : null;
        settings.minTownHallLevel = minThLevel;
        settings.requireWarExperience = requireWar;
        settings.updatedAt = new Date();
    } else {
        // Create new settings
        settings = new RecruitmentSettings({
            guildId: interaction.guild.id,
            applicationChannelId: applicationChannel.id,
            reviewChannelId: reviewChannel.id,
            alertRoleId: alertRole ? alertRole.id : null,
            minTownHallLevel: minThLevel,
            requireWarExperience: requireWar
        });
    }

    await settings.save();

    // Create welcome message in application channel if it doesn't exist
    if (!settings.welcomeMessage) {
        settings.welcomeMessage = `Welcome to ${linkedClan.name}'s recruitment channel!\n\nUse \`/recruit apply\` to apply to join our clan.`;
        await settings.save();

        try {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`${linkedClan.name} Recruitment`)
                .setDescription(settings.welcomeMessage)
                .addFields({
                    name: 'How to Apply',
                    value: 'Click the Apply button below or use the `/recruit apply` command.'
                })
                .setFooter({ text: 'Applications are reviewed by clan leadership' });

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('apply_button')
                        .setLabel('Apply to Join')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📝')
                );

            await applicationChannel.send({ embeds: [welcomeEmbed], components: [actionRow] });
        } catch (error) {
            console.error('Error sending welcome message:', error);
            // Continue even if sending welcome message fails
        }
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Recruitment System Setup Complete')
        .setDescription(`Recruitment system has been set up for ${linkedClan.name}`)
        .addFields(
            { name: 'Application Channel', value: `<#${applicationChannel.id}>`, inline: true },
            { name: 'Review Channel', value: `<#${reviewChannel.id}>`, inline: true },
            { name: 'Alert Role', value: alertRole ? `<@&${alertRole.id}>` : 'None', inline: true },
            { name: 'Minimum TH Level', value: minThLevel.toString(), inline: true },
            { name: 'Require War Experience', value: requireWar ? 'Yes' : 'No', inline: true }
        )
        .setFooter({ text: 'Use /recruit welcome and /recruit requirements to customize further' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set the welcome message for recruitment
 */
async function setWelcomeMessage(interaction, linkedClan) {
    await interaction.deferReply();

    const welcomeMessage = interaction.options.getString('message');

    // Check if settings exist
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.editReply('Recruitment system is not set up yet. Use `/recruit setup` first.');
    }

    // Update welcome message
    settings.welcomeMessage = welcomeMessage;
    settings.updatedAt = new Date();
    await settings.save();

    // Update welcome message in application channel
    try {
        const channel = await interaction.guild.channels.fetch(settings.applicationChannelId);

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${linkedClan.name} Recruitment`)
            .setDescription(welcomeMessage)
            .addFields({
                name: 'How to Apply',
                value: 'Click the Apply button below or use the `/recruit apply` command.'
            })
            .setFooter({ text: 'Applications are reviewed by clan leadership' });

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('apply_button')
                    .setLabel('Apply to Join')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝')
            );

        await channel.send({ embeds: [welcomeEmbed], components: [actionRow] });
    } catch (error) {
        console.error('Error sending updated welcome message:', error);
        // Continue even if sending welcome message fails
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Welcome Message Updated')
        .setDescription('The recruitment welcome message has been updated')
        .addFields({ name: 'New Message', value: welcomeMessage })
        .setFooter({ text: 'A new welcome message has been posted in the application channel' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set clan requirements
 */
async function setRequirements(interaction, linkedClan) {
    await interaction.deferReply();

    const requirements = interaction.options.getString('requirements');

    // Check if settings exist
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.editReply('Recruitment system is not set up yet. Use `/recruit setup` first.');
    }

    // Update requirements
    settings.requirements = requirements;
    settings.updatedAt = new Date();
    await settings.save();

    // Update requirements in application channel
    try {
        const channel = await interaction.guild.channels.fetch(settings.applicationChannelId);

        const requirementsEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle(`${linkedClan.name} Requirements`)
            .setDescription(requirements)
            .setFooter({ text: 'Make sure you meet these requirements before applying' });

        await channel.send({ embeds: [requirementsEmbed] });
    } catch (error) {
        console.error('Error sending updated requirements:', error);
        // Continue even if sending requirements fails
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Clan Requirements Updated')
        .setDescription('The clan recruitment requirements have been updated')
        .addFields({ name: 'Requirements', value: requirements })
        .setFooter({ text: 'Requirements have been posted in the application channel' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Apply to join the clan
 */
async function applyToClan(interaction) {
    // Check if recruitment is set up
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.reply({
            content: 'Recruitment system is not set up on this server.',
            ephemeral: true
        });
    }

    // Check if user already has a pending application
    const existingApplication = await Recruitment.findOne({
        guildId: interaction.guild.id,
        applicantId: interaction.user.id,
        status: 'pending'
    });

    if (existingApplication) {
        return interaction.reply({
            content: 'You already have a pending application. Please wait for it to be reviewed.',
            ephemeral: true
        });
    }

    // Create application modal
    const modal = new ModalBuilder()
        .setCustomId('recruitment_application')
        .setTitle('Clan Application');

    // Add inputs to modal
    const playerTagInput = new TextInputBuilder()
        .setCustomId('player_tag')
        .setLabel('Your Clash of Clans Player Tag (e.g., #ABC123)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const townHallInput = new TextInputBuilder()
        .setCustomId('town_hall')
        .setLabel('Town Hall Level')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const warExperienceInput = new TextInputBuilder()
        .setCustomId('war_experience')
        .setLabel('War Experience (Stars, Strategies, etc.)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(settings.requireWarExperience);

    const aboutInput = new TextInputBuilder()
        .setCustomId('about')
        .setLabel('About Yourself')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Tell us about your play style, activity, etc.')
        .setRequired(false);

    const additionalInput = new TextInputBuilder()
        .setCustomId('additional')
        .setLabel('Additional Information')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Anything else you want us to know?')
        .setRequired(false);

    // Add inputs to rows
    const firstRow = new ActionRowBuilder().addComponents(playerTagInput);
    const secondRow = new ActionRowBuilder().addComponents(townHallInput);
    const thirdRow = new ActionRowBuilder().addComponents(warExperienceInput);
    const fourthRow = new ActionRowBuilder().addComponents(aboutInput);
    const fifthRow = new ActionRowBuilder().addComponents(additionalInput);

    // Add rows to the modal
    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    // Show the modal
    await interaction.showModal(modal);
}

/**
 * Handle modal submission for recruitment application
 */
async function handleApplicationSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Get values from the modal
    const playerTag = interaction.fields.getTextInputValue('player_tag');
    const townHallLevel = parseInt(interaction.fields.getTextInputValue('town_hall'));
    const warExperience = interaction.fields.getTextInputValue('war_experience');
    const about = interaction.fields.getTextInputValue('about');
    const additional = interaction.fields.getTextInputValue('additional');

    // Validate player tag
    let formattedTag = playerTag.trim();
    if (!formattedTag.startsWith('#')) {
        formattedTag = '#' + formattedTag;
    }
    formattedTag = formattedTag.toUpperCase();

    // Check if settings exist
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.editReply('Recruitment system is not properly set up. Please contact an admin.');
    }

    // Validate town hall level
    if (isNaN(townHallLevel) || townHallLevel < 1 || townHallLevel > 15) {
        return interaction.editReply('Please enter a valid Town Hall level (1-15).');
    }

    // Check minimum town hall requirement
    if (townHallLevel < settings.minTownHallLevel) {
        return interaction.editReply(`Sorry, our clan requires a minimum Town Hall level of ${settings.minTownHallLevel}. Your application cannot be processed.`);
    }

    // Try to get actual player data from API
    let playerData = null;
    try {
        playerData = await clashApiService.getPlayer(formattedTag);
    } catch (error) {
        console.error('Error fetching player data:', error);
        // Continue with manual input if API fails
    }

    // If player data was fetched, use it to verify and enhance the application
    if (playerData) {
        // Verify town hall level
        if (playerData.townhallLevel < settings.minTownHallLevel) {
            return interaction.editReply(`Your actual Town Hall level (${playerData.townhallLevel}) does not meet our minimum requirement of TH${settings.minTownHallLevel}.`);
        }

        // Create application with API data
        const application = new Recruitment({
            guildId: interaction.guild.id,
            applicantId: interaction.user.id,
            applicantTag: playerData.tag,
            applicantName: playerData.name,
            townHallLevel: playerData.townhallLevel,
            heroLevels: {
                barbarian: getHeroLevel(playerData.heroes, 'Barbarian King'),
                archer: getHeroLevel(playerData.heroes, 'Archer Queen'),
                warden: getHeroLevel(playerData.heroes, 'Grand Warden'),
                royal: getHeroLevel(playerData.heroes, 'Royal Champion'),
                champion: getHeroLevel(playerData.heroes, 'Battle Machine')
            },
            warStars: playerData.warStars,
            preferredAttackStrategy: warExperience,
            trophies: playerData.trophies,
            donations: playerData.donations,
            experience: about,
            additionalInfo: additional,
            status: 'pending'
        });

        await application.save();
    } else {
        // Create application with manual input
        const application = new Recruitment({
            guildId: interaction.guild.id,
            applicantId: interaction.user.id,
            applicantTag: formattedTag,
            applicantName: interaction.user.username,
            townHallLevel: townHallLevel,
            preferredAttackStrategy: warExperience,
            experience: about,
            additionalInfo: additional,
            status: 'pending'
        });

        await application.save();
    }

    // Send application to review channel
    try {
        await sendApplicationToReviewChannel(interaction, formattedTag, settings, playerData);
    } catch (error) {
        console.error('Error sending application to review channel:', error);
        // Continue even if sending to review channel fails
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Application Submitted')
        .setDescription('Your application has been submitted successfully!')
        .addFields(
            { name: 'Player Tag', value: formattedTag, inline: true },
            { name: 'Town Hall Level', value: playerData ? playerData.townhallLevel.toString() : townHallLevel.toString(), inline: true },
            { name: 'Next Steps', value: 'Your application will be reviewed by clan leadership. You will be notified when a decision is made.' }
        )
        .setFooter({ text: 'Thank you for your interest in our clan!' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Send application to the review channel
 */
async function sendApplicationToReviewChannel(interaction, playerTag, settings, playerData = null) {
    // Get the review channel
    const channel = await interaction.guild.channels.fetch(settings.reviewChannelId);

    if (!channel) {
        throw new Error('Review channel not found');
    }

    // Create embed for the application
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('New Clan Application')
        .setDescription(`<@${interaction.user.id}> has applied to join the clan`)
        .addFields(
            { name: 'Discord', value: interaction.user.username, inline: true },
            { name: 'Player Tag', value: playerTag, inline: true },
            { name: 'Application Date', value: new Date().toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Use /recruit approve, /recruit reject, or /recruit waitlist to respond' });

    // Add player data if available
    if (playerData) {
        embed.addFields(
            { name: 'Player Name', value: playerData.name, inline: true },
            { name: 'Town Hall', value: playerData.townhallLevel.toString(), inline: true },
            { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
            { name: 'War Stars', value: playerData.warStars.toString(), inline: true },
            { name: 'Donations', value: (playerData.donations || 0).toString(), inline: true },
            { name: 'Exp Level', value: playerData.expLevel.toString(), inline: true }
        );

        // Add hero levels if available
        const heroText = getHeroLevelsText(playerData.heroes);
        if (heroText) {
            embed.addFields({ name: 'Heroes', value: heroText });
        }
    }

    // Add application details from modal
    const application = await Recruitment.findOne({
        guildId: interaction.guild.id,
        applicantId: interaction.user.id,
        status: 'pending'
    });

    if (application) {
        if (application.preferredAttackStrategy) {
            embed.addFields({ name: 'War Experience', value: application.preferredAttackStrategy });
        }

        if (application.experience) {
            embed.addFields({ name: 'About Player', value: application.experience });
        }

        if (application.additionalInfo) {
            embed.addFields({ name: 'Additional Info', value: application.additionalInfo });
        }
    }

    // Create action buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_${playerTag.replace('#', '')}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_${playerTag.replace('#', '')}`)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`waitlist_${playerTag.replace('#', '')}`)
                .setLabel('Waitlist')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`view_${playerTag.replace('#', '')}`)
                .setLabel('View Profile')
                .setStyle(ButtonStyle.Primary)
        );

    // Send to review channel
    const message = await channel.send({
        content: settings.alertRoleId ? `<@&${settings.alertRoleId}> New clan application!` : 'New clan application!',
        embeds: [embed],
        components: [actionRow]
    });

    return message;
}

/**
 * Review all pending applications
 */
async function reviewApplications(interaction, linkedClan) {
    await interaction.deferReply({ ephemeral: true });

    // Check if settings exist
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.editReply('Recruitment system is not set up yet. Use `/recruit setup` first.');
    }

    // Find all pending applications
    const pendingApplications = await Recruitment.find({
        guildId: interaction.guild.id,
        status: 'pending'
    }).sort({ applicationDate: 1 });

    if (pendingApplications.length === 0) {
        return interaction.editReply('There are no pending applications at this time.');
    }

    // Create embed with the list of applications
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Pending Clan Applications')
        .setDescription(`There are ${pendingApplications.length} pending applications`)
        .setFooter({ text: 'Use /recruit approve, /recruit reject, or /recruit waitlist to respond' });

    // Add fields for each application
    for (const app of pendingApplications) {
        let fieldValue = `Player Tag: ${app.applicantTag}\n`;
        fieldValue += `Town Hall: ${app.townHallLevel}\n`;

        if (app.warStars) {
            fieldValue += `War Stars: ${app.warStars}\n`;
        }

        fieldValue += `Applied: ${new Date(app.applicationDate).toLocaleDateString()}\n`;

        embed.addFields({
            name: app.applicantName || `Discord: ${await getUsername(interaction.guild, app.applicantId)}`,
            value: fieldValue
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Handle application approval, rejection, or waitlisting
 */
async function handleApplication(interaction, linkedClan, status) {
    await interaction.deferReply();

    // Format player tag
    let playerTag = interaction.options.getString('player_tag');
    if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
    }
    playerTag = playerTag.toUpperCase();

    const notes = interaction.options.getString('notes') || interaction.options.getString('reason') || '';

    // Find the application
    const application = await Recruitment.findOne({
        guildId: interaction.guild.id,
        applicantTag: playerTag,
        status: 'pending'
    });

    if (!application) {
        return interaction.editReply(`No pending application found for player ${playerTag}.`);
    }

    // Update application status
    application.status = status;
    application.reviewedBy = interaction.user.id;
    application.reviewNotes = notes;
    application.reviewDate = new Date();
    application.updatedAt = new Date();

    await application.save();

    // Try to notify the applicant
    try {
        const applicant = await interaction.guild.members.fetch(application.applicantId);

        if (applicant) {
            const notificationEmbed = new EmbedBuilder()
                .setTitle(`Clan Application ${formatStatus(status)}`)
                .setDescription(`Your application to join ${linkedClan.name} has been ${formatStatus(status).toLowerCase()}.`)
                .setFooter({ text: `Reviewed by ${interaction.user.username}` });

            // Set color based on status
            if (status === 'approved') {
                notificationEmbed.setColor('#00ff00');
                notificationEmbed.addFields({
                    name: 'Next Steps',
                    value: `1. Send a join request to ${linkedClan.name} (${linkedClan.clanTag}) in Clash of Clans\n2. Let us know when you've sent the request`
                });
            } else if (status === 'rejected') {
                notificationEmbed.setColor('#e74c3c');
            } else if (status === 'waitlisted') {
                notificationEmbed.setColor('#f1c40f');
                notificationEmbed.addFields({
                    name: 'Waitlist Information',
                    value: 'Your application has been waitlisted. We may contact you when a spot becomes available.'
                });
            }

            // Add notes if provided
            if (notes) {
                notificationEmbed.addFields({ name: 'Notes', value: notes });
            }

            await applicant.send({ embeds: [notificationEmbed] });
        }
    } catch (error) {
        console.error('Error notifying applicant:', error);
        // Continue even if notification fails
    }

    // Create response embed
    const embed = new EmbedBuilder()
        .setTitle(`Application ${formatStatus(status)}`)
        .setDescription(`${application.applicantName || playerTag}'s application has been ${formatStatus(status).toLowerCase()}.`)
        .addFields({ name: 'Reviewer', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: `Player Tag: ${playerTag}` });

    // Set color based on status
    if (status === 'approved') {
        embed.setColor('#00ff00');
    } else if (status === 'rejected') {
        embed.setColor('#e74c3c');
    } else if (status === 'waitlisted') {
        embed.setColor('#f1c40f');
    }

    // Add notes if provided
    if (notes) {
        embed.addFields({ name: 'Notes', value: notes });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Show recruitment statistics
 */
async function showRecruitmentStats(interaction, linkedClan) {
    await interaction.deferReply();

    // Check if settings exist
    const settings = await RecruitmentSettings.findOne({ guildId: interaction.guild.id });

    if (!settings) {
        return interaction.editReply('Recruitment system is not set up yet. Use `/recruit setup` first.');
    }

    // Get recruitment statistics
    const totalApplications = await Recruitment.countDocuments({ guildId: interaction.guild.id });
    const pendingApplications = await Recruitment.countDocuments({ guildId: interaction.guild.id, status: 'pending' });
    const approvedApplications = await Recruitment.countDocuments({ guildId: interaction.guild.id, status: 'approved' });
    const rejectedApplications = await Recruitment.countDocuments({ guildId: interaction.guild.id, status: 'rejected' });
    const waitlistedApplications = await Recruitment.countDocuments({ guildId: interaction.guild.id, status: 'waitlisted' });

    // Calculate statistics by town hall level
    const thStats = {};

    for (let th = settings.minTownHallLevel; th <= 15; th++) {
        const count = await Recruitment.countDocuments({
            guildId: interaction.guild.id,
            townHallLevel: th
        });

        const approved = await Recruitment.countDocuments({
            guildId: interaction.guild.id,
            townHallLevel: th,
            status: 'approved'
        });

        if (count > 0) {
            thStats[th] = { count, approved, rate: Math.round((approved / count) * 100) };
        }
    }

    // Get recent applications (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentApplications = await Recruitment.countDocuments({
        guildId: interaction.guild.id,
        applicationDate: { $gte: thirtyDaysAgo }
    });

    // Create stats embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`${linkedClan.name} Recruitment Statistics`)
        .addFields(
            { name: 'Total Applications', value: totalApplications.toString(), inline: true },
            { name: 'Recent (30 days)', value: recentApplications.toString(), inline: true },
            { name: 'Approval Rate', value: totalApplications > 0 ? `${Math.round((approvedApplications / totalApplications) * 100)}%` : 'N/A', inline: true },
            { name: 'Current Status', value:
                    `✅ Approved: ${approvedApplications}\n` +
                    `⏳ Pending: ${pendingApplications}\n` +
                    `⏱️ Waitlisted: ${waitlistedApplications}\n` +
                    `❌ Rejected: ${rejectedApplications}`
            }
        )
        .setFooter({ text: `Min TH Level: ${settings.minTownHallLevel}` });

    // Add town hall statistics
    let thStatsText = '';
    for (const [th, stats] of Object.entries(thStats)) {
        thStatsText += `TH${th}: ${stats.count} apps, ${stats.approved} approved (${stats.rate}%)\n`;
    }

    if (thStatsText) {
        embed.addFields({ name: 'By Town Hall Level', value: thStatsText });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Helper function to get hero level from heroes array
 */
function getHeroLevel(heroes, heroName) {
    if (!heroes || !Array.isArray(heroes)) return null;

    const hero = heroes.find(h => h.name === heroName);
    return hero ? hero.level : null;
}

/**
 * Helper function to format hero levels text
 */
function getHeroLevelsText(heroes) {
    if (!heroes || !Array.isArray(heroes) || heroes.length === 0) return null;

    return heroes.map(hero => `${hero.name}: ${hero.level}/${hero.maxLevel}`).join('\n');
}

/**
 * Helper function to get username for a Discord ID
 */
async function getUsername(guild, discordId) {
    try {
        const member = await guild.members.fetch(discordId);
        return member.user.username;
    } catch (error) {
        return 'Unknown User';
    }
}

/**
 * Helper function to format application status
 */
function formatStatus(status) {
    switch (status) {
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'waitlisted': return 'Waitlisted';
        case 'pending': return 'Pending';
        default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
}

// Handle button interactions
/**
 * This function should be registered in your main event handler for button interactions
 */
function handleRecruitmentButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'apply_button') {
        // Show the apply modal
        applyToClan(interaction);
        return true;
    }

    if (customId.startsWith('approve_') || customId.startsWith('reject_') || customId.startsWith('waitlist_')) {
        // Handle approval/rejection/waitlist buttons
        const playerTag = '#' + customId.split('_')[1];
        const status = customId.startsWith('approve_') ? 'approved' :
            customId.startsWith('reject_') ? 'rejected' : 'waitlisted';

        // Show a modal to collect notes
        const modal = new ModalBuilder()
            .setCustomId(`${status}_notes_${playerTag.replace('#', '')}`)
            .setTitle(`${formatStatus(status)} Application`);

        const notesInput = new TextInputBuilder()
            .setCustomId('notes')
            .setLabel(`Notes for ${status} (optional)`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(notesInput));

        interaction.showModal(modal);
        return true;
    }

    if (customId.startsWith('view_')) {
        // Show player profile
        const playerTag = '#' + customId.split('_')[1];

        // Use the player command to display the profile
        const playerCommand = require('../info/player');

        // Create a mock interaction with the player tag
        const mockOptions = {
            getString: (name) => name === 'tag' ? playerTag : null,
            getUser: () => null
        };

        const mockInteraction = {
            ...interaction,
            options: mockOptions,
            commandName: 'player'
        };

        // Execute the player command
        playerCommand.execute(mockInteraction);
        return true;
    }

    return false;
}

// At the bottom of the file, add this export
module.exports.handleRecruitmentButton = handleRecruitmentButton;
module.exports.handleApplicationSubmit = handleApplicationSubmit;