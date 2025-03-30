// src/commands/info/clan.js - Fixed version
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan'); // Import from models directory

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Get information about a Clash of Clans clan')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false)),

    manualDeferring: true,

    async execute(interaction) {
        await interaction.deferReply();

        try {
            let clanTag;

            // Check if tag option is provided
            clanTag = interaction.options.getString('tag');

            // If no tag provided, check for linked clan
            if (!clanTag) {
                try {
                    // Use Promise.race to prevent hanging on database query
                    const linkedClan = await Promise.race([
                        Clan.findOne({ guildId: interaction.guild.id }),
                        new Promise((_, reject) => setTimeout(() =>
                            reject(new Error('Database query timed out')), 2000))
                    ]);

                    if (!linkedClan) {
                        await interaction.editReply("Please provide a clan tag or link a clan to this server using `/setclan` command.");
                        return;
                    }

                    clanTag = linkedClan.clanTag;

                    // Add # prefix if missing
                    if (!clanTag.startsWith('#')) {
                        clanTag = '#' + clanTag;
                    }
                } catch (error) {
                    console.error('Database error when finding linked clan:', error);
                    await interaction.editReply("Error retrieving the server's linked clan. Please provide a clan tag directly.");
                    return;
                }
            }

            // Format tag if needed
            if (!clanTag.startsWith('#')) {
                clanTag = '#' + clanTag;
            }

            // Fetch clan data
            const clanData = await clashApiService.getClan(clanTag);

            if (!clanData) {
                return interaction.editReply("Could not find clan. Please check the tag and try again.");
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${clanData.name} (${clanData.tag})`)
                .setThumbnail(clanData.badgeUrls?.medium || null)
                .addFields(
                    { name: 'Level', value: `${clanData.clanLevel}`, inline: true },
                    { name: 'Members', value: `${clanData.members}/50`, inline: true },
                    { name: 'War League', value: clanData.warLeague?.name || 'Not in league', inline: true },
                    { name: 'Win/Loss/Draw', value: `${clanData.warWins || 0}/${clanData.warLosses || 0}/${clanData.warTies || 0}`, inline: true },
                    { name: 'Location', value: clanData.location?.name || 'Not set', inline: true },
                    { name: 'War Frequency', value: clanData.warFrequency || 'Unknown', inline: true }
                )
                .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Add description if available
            if (clanData.description) {
                embed.setDescription(clanData.description);
            }

            // Add clan capital info if available
            if (clanData.clanCapital) {
                embed.addFields({
                    name: 'Clan Capital',
                    value: `Capital Hall: Level ${clanData.clanCapital.capitalHallLevel || 1}`,
                    inline: true
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in clan command:', error);

            if (error.message?.includes('404')) {
                return interaction.editReply('Clan not found. Please check the tag and try again.');
            }

            return interaction.editReply('An error occurred while fetching clan data. Please try again later.');
        }
    },
};