const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

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

    async execute(interaction) {
        await interaction.deferReply();

        try {
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
                clanData = await clashApiService.getClan(clanTag);
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

            // Create or update clan document with error handling
            try {
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
                    { upsert: true, new: true }
                );

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

                // Use the centralized database error handler
                const errorMessage = ErrorHandler.handleDatabaseError(dbError);
                return interaction.editReply(`Failed to set up clan: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Unexpected error in setclan command:', error);
            return interaction.editReply('An unexpected error occurred while setting up the clan. Please try again later.');
        }
    },
};