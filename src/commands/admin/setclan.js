const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');
const databaseService = require('../../services/databaseService');

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
        // Comprehensive logging
        console.log(`[SETCLAN] Command initiated`);
        console.log(`User: ${interaction.user.tag} (${interaction.user.id})`);
        console.log(`Guild: ${interaction.guild.name} (${interaction.guild.id})`);

        try {
            // Defer reply with robust error handling
            await interaction.deferReply({ ephemeral: false }).catch(err => {
                console.error('[SETCLAN] Failed to defer reply:', err);
                throw new Error('Could not acknowledge the interaction');
            });

            // Validate database connection
            console.log('[SETCLAN] Checking database connection...');
            if (!databaseService.checkConnection()) {
                console.log('[SETCLAN] Database not connected, attempting to connect...');
                try {
                    await databaseService.connect();
                    console.log('[SETCLAN] Database connection established');
                } catch (connErr) {
                    console.error('[SETCLAN] Database connection failed:', connErr);
                    return interaction.editReply({
                        content: '❌ Cannot connect to the database. Please try again later.',
                        ephemeral: true
                    });
                }
            }

            // Validate clan tag
            const rawTag = interaction.options.getString('tag');
            console.log(`[SETCLAN] Validating clan tag: ${rawTag}`);

            const validation = validateTag(rawTag);
            if (!validation.valid) {
                console.warn(`[SETCLAN] Invalid clan tag: ${rawTag}`);
                return interaction.editReply({
                    content: `❌ ${validation.message}`,
                    ephemeral: true
                });
            }

            const clanTag = validation.formattedTag;

            // Fetch clan data with timeout
            let clanData;
            try {
                console.log(`[SETCLAN] Fetching clan data for tag: ${clanTag}`);
                clanData = await clashApiService.getClan(clanTag);
                console.log(`[SETCLAN] Clan data fetched: ${clanData.name}`);
            } catch (error) {
                console.error('[SETCLAN] Clan fetch error:', error);

                // Detailed error handling
                if (error.response?.status === 404) {
                    return interaction.editReply({
                        content: '❌ Clan not found. Please check the tag and try again.',
                        ephemeral: true
                    });
                }

                return interaction.editReply({
                    content: `❌ API Error: ${error.message}. Please try again later.`,
                    ephemeral: true
                });
            }

            // Validate and process channels
            const warChannel = interaction.options.getChannel('war_channel');
            const generalChannel = interaction.options.getChannel('general_channel') || interaction.channel;

            // Validate channel types
            const validateChannel = (channel, channelType) => {
                if (channel && channel.type !== ChannelType.GuildText) {
                    throw new Error(`${channelType} channel must be a text channel.`);
                }
                return channel;
            };

            try {
                validateChannel(warChannel, 'War');
                validateChannel(generalChannel, 'General');
            } catch (channelError) {
                console.warn(`[SETCLAN] Channel validation error: ${channelError.message}`);
                return interaction.editReply({
                    content: `❌ ${channelError.message}`,
                    ephemeral: true
                });
            }

            // Save clan data to database
            try {
                console.log('[SETCLAN] Saving clan to database...');
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
                        runValidators: true
                    }
                );

                console.log(`[SETCLAN] Clan saved successfully: ${clan.name}`);

                // Create success embed
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ Clan Setup Successful')
                    .setDescription(`Linked to Clash of Clans clan:`)
                    .setThumbnail(clanData.badgeUrls?.medium || null)
                    .addFields(
                        { name: 'Clan Name', value: clanData.name, inline: true },
                        { name: 'Clan Tag', value: clanData.tag, inline: true },
                        { name: 'Clan Level', value: clanData.clanLevel.toString(), inline: true },
                        { name: 'Members', value: `${clanData.members}/50`, inline: true },
                        {
                            name: 'War Channel',
                            value: warChannel ? `<#${warChannel.id}>` : 'Not set',
                            inline: true
                        },
                        {
                            name: 'General Channel',
                            value: `<#${generalChannel.id}>`,
                            inline: true
                        }
                    )
                    .setFooter({
                        text: 'Clan successfully linked to this Discord server',
                        iconURL: interaction.client.user.displayAvatarURL()
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });

            } catch (dbError) {
                console.error('[SETCLAN] Database save error:', dbError);

                // Use ErrorHandler for database-specific error messages
                const userMessage = ErrorHandler.handleDatabaseError(dbError);

                return interaction.editReply({
                    content: `❌ Database Error: ${userMessage}`,
                    ephemeral: true
                });
            }

        } catch (unexpectedError) {
            console.error('[SETCLAN] Unexpected critical error:', unexpectedError);

            // Last resort error handling
            return interaction.editReply({
                content: '❌ An unexpected error occurred. Please contact support if this persists.',
                ephemeral: true
            });
        }
    },
};