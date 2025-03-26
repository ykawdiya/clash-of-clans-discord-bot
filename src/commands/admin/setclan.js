const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');
const databaseService = require('../../services/databaseService');

const fetchWithTimeout = async (promise, timeout = 5000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
    ]);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setclan')
        .setDescription('Set the primary clan for this Discord server')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('war_channel')
                .setDescription('Channel for war announcements')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('general_channel')
                .setDescription('Channel for general clan announcements')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Flag to indicate this command requires database access
    requiresDatabase: true,

    async execute(interaction) {
        // Acknowledge the interaction immediately
        await interaction.deferReply().catch(err => console.error('Failed to defer reply:', err));

        try {
            console.log(`[SETCLAN] User ${interaction.user.id} set clan ${interaction.options.getString('tag')} in guild ${interaction.guild.id}`);

            // First ensure we have a database connection
            if (!databaseService.checkConnection()) {
                console.log('Database connection not established, attempting to connect...');
                try {
                    await databaseService.connect();
                    console.log('Successfully connected to database');
                } catch (connErr) {
                    console.error('Failed to establish database connection:', connErr);
                    return interaction.editReply('Unable to connect to the database. Please try again later.');
                }
            }

            // Get clan tag from options and validate it
            let clanTag = interaction.options.getString('tag');

            // Use the tag validator utility
            const validation = validateTag(clanTag);
            if (!validation.valid) {
                return interaction.editReply(validation.message);
            }
            clanTag = validation.formattedTag;

            // Get channel options and validate them
            const warChannel = interaction.options.getChannel('war_channel');
            const generalChannel = interaction.options.getChannel('general_channel') || interaction.channel;

            // Validate that channels are text channels
            if (warChannel && warChannel.type !== ChannelType.GuildText) {
                return interaction.editReply('War channel must be a text channel.');
            }

            if (generalChannel && generalChannel.type !== ChannelType.GuildText) {
                return interaction.editReply('General channel must be a text channel.');
            }

            // Check if bot has access to the channels
            if (warChannel && !warChannel.permissionsFor(interaction.client.user).has('SendMessages')) {
                return interaction.editReply(`I don't have permission to send messages in ${warChannel}.`);
            }

            if (generalChannel && !generalChannel.permissionsFor(interaction.client.user).has('SendMessages')) {
                return interaction.editReply(`I don't have permission to send messages in ${generalChannel}.`);
            }

            // Check if clan exists with appropriate error handling
            let clanData;
            try {
                clanData = await fetchWithTimeout(clashApiService.getClan(clanTag));
            } catch (error) {
                console.error('Error fetching clan data:', error);

                if (error.response?.status === 404) {
                    return interaction.editReply('Clan not found. Please check the tag and try again.');
                }

                // Log detailed information for troubleshooting
                console.error('Detailed error:', {
                    errorMessage: error.message,
                    errorCode: error.code,
                    statusCode: error.response?.status,
                    responseData: error.response?.data,
                    stack: error.stack
                });

                return interaction.editReply('An error occurred while fetching clan data. Please try again later.');
            }

            // Double check MongoDB connection state before database operations
            if (mongoose.connection.readyState !== 1) {
                console.error('Database connection is not in connected state before operation. Current state:', mongoose.connection.readyState);
                return interaction.editReply('Database connection issue. Please try again later.');
            }

            // Create or update clan document with error handling
            try {
                console.log('Attempting to save clan to database:', {
                    clanTag,
                    name: clanData.name,
                    guildId: interaction.guild.id
                });

                const clan = await Clan.findOneAndUpdate(
                    { clanTag },
                    {
                        clanTag,
                        name: clanData.name,
                        guildId: interaction.guild.id,
                        description: clanData.description,
                        settings: {
                            channels: {
                                warAnnouncements: warChannel?.id,
                                general: generalChannel?.id
                            }
                        },
                        updatedAt: Date.now()
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true // This ensures validation runs on update too
                    }
                );

                console.log('Clan saved successfully:', clan);

                // Create success embed
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('Clan Setup Successful')
                    .setDescription(`This Discord server has been linked to the following Clash of Clans clan:`)
                    .setThumbnail(clanData.badgeUrls.medium)
                    .addFields(
                        { name: 'Clan Name', value: clanData.name, inline: true },
                        { name: 'Clan Tag', value: clanData.tag, inline: true },
                        { name: 'Clan Level', value: clanData.clanLevel.toString(), inline: true },
                        { name: 'Members', value: `${clanData.members}/50`, inline: true },
                        { name: 'War Channel', value: warChannel ? `<#${warChannel.id}>` : 'Not set', inline: true },
                        { name: 'General Channel', value: `<#${generalChannel.id}>`, inline: true }
                    )
                    .setFooter({ text: 'You can now use clan commands without specifying a tag', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            } catch (dbError) {
                console.error('Database error in setclan command:', dbError);

                // Log more detailed information about the error
                console.error('Error details:', {
                    name: dbError.name,
                    code: dbError.code,
                    keyValue: dbError.keyValue,
                    message: dbError.message,
                    stack: dbError.stack
                });

                // Add more specific error messages based on common database issues
                let userMessage = `Failed to set up clan: ${ErrorHandler.handleDatabaseError(dbError)}`;

                if (dbError.name === 'MongooseServerSelectionError') {
                    userMessage = 'Could not connect to the database server. Please check your database connection and try again.';
                } else if (dbError.name === 'ValidationError') {
                    userMessage = 'The clan data failed validation. Please check the clan information and try again.';
                } else if (dbError.code === 11000) {
                    userMessage = 'This clan is already registered with another Discord server.';
                }

                return interaction.editReply(userMessage);
            }
        } catch (error) {
            console.error('Unexpected error in setclan command:', error);
            return interaction.editReply('An unexpected error occurred while setting up the clan. Please try again later.');
        }
    },
};