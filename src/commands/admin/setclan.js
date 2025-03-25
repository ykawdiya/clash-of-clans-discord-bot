const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');

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
            // Get clan tag from options
            let clanTag = interaction.options.getString('tag');

            // Format the tag (add # if missing)
            if (!clanTag.startsWith('#')) {
                clanTag = `#${clanTag}`;
            }

            // Check if clan exists
            let clanData;
            try {
                clanData = await clashApiService.getClan(clanTag);
            } catch (error) {
                if (error.response?.status === 404) {
                    return interaction.editReply('Clan not found. Please check the tag and try again.');
                }
                throw error;
            }

            // Get channel options
            const warChannel = interaction.options.getChannel('war_channel');
            const generalChannel = interaction.options.getChannel('general_channel');

            // Create or update clan document
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
                            general: generalChannel?.id || interaction.channel.id
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
                    { name: 'General Channel', value: generalChannel ? `<#${generalChannel.id}>` : `<#${interaction.channel.id}>`, inline: true }
                )
                .setFooter({ text: 'You can now use clan commands without specifying a tag', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in setclan command:', error);
            return interaction.editReply('An error occurred while setting up the clan. Please try again later.');
        }
    },
};