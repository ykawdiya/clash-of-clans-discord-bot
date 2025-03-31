// src/commands/info/clan.js - Updated for family support
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const clanFamilyService = require('../../services/clanFamilyService');
const { validateTag } = require('../../utils/validators');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Get information about a Clash of Clans clan')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('family_clan')
                .setDescription('Choose a clan from your family')
                .setRequired(false)
                .addChoices(
                    { name: '⏳ Loading...', value: 'loading' }
                )),

    manualDeferring: true,

    // Dynamically populate family_clan option choices
    async autocomplete(interaction) {
        if (interaction.options.getFocused(true).name !== 'family_clan') {
            return;
        }

        try {
            // Get family for this guild
            const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
            if (!family || family.clans.length === 0) {
                return interaction.respond([{ name: 'No family clans found', value: 'none' }]);
            }

            // Build choices for each clan in the family
            const choices = family.clans.map(clan => {
                const roleEmoji = this.getRoleEmoji(clan.familyRole);
                return {
                    name: `${roleEmoji} ${clan.name}`,
                    value: clan.clanTag
                };
            });

            return interaction.respond(choices);
        } catch (error) {
            console.error('Error in clan autocomplete:', error);
            return interaction.respond([{ name: 'Error loading clans', value: 'error' }]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply();

        try {
            let clanTag;
            let familyClan = false;

            // Check if tag option is provided
            clanTag = interaction.options.getString('tag');

            // Check if family_clan option is provided
            const familyClanTag = interaction.options.getString('family_clan');
            if (familyClanTag && familyClanTag !== 'loading' && familyClanTag !== 'none' && familyClanTag !== 'error') {
                clanTag = familyClanTag;
                familyClan = true;
            }

            // If no tag provided, check for linked clan or family
            if (!clanTag) {
                try {
                    // Check for clan family first
                    const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);

                    if (family && family.clans.length > 0) {
                        // If there's only one clan, use it directly
                        if (family.clans.length === 1) {
                            clanTag = family.clans[0].clanTag;
                        }
                        // If there are multiple clans, show a menu to select
                        else {
                            return this.showClanSelectionMenu(interaction, family);
                        }
                    } else {
                        // No family, fall back to linked clan
                        const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

                        if (!linkedClan) {
                            await interaction.editReply("Please provide a clan tag or link a clan to this server using `/setclan` command.");
                            return;
                        }

                        clanTag = linkedClan.clanTag;
                    }

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

            // If this is from a family, add family info
            if (familyClan || !clanTag) {
                try {
                    const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
                    if (family) {
                        const clanInFamily = family.clans.find(c => c.clanTag === clanData.tag);
                        if (clanInFamily) {
                            const roleEmoji = this.getRoleEmoji(clanInFamily.familyRole);
                            embed.addFields({
                                name: 'Family',
                                value: `${roleEmoji} ${family.familyName} (${clanInFamily.familyRole.charAt(0).toUpperCase() + clanInFamily.familyRole.slice(1)})`,
                                inline: true
                            });

                            // If there are multiple clans, add a field to view other clans
                            if (family.clans.length > 1) {
                                embed.addFields({
                                    name: 'Family Clans',
                                    value: `Use \`/clanfamily list\` to view all ${family.clans.length} clans in this family.`
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error getting family info:', error);
                }
            }

            // Add requirements if available
            const dbClan = await Clan.findOne({ clanTag: clanData.tag });
            if (dbClan && dbClan.requirements && dbClan.requirements.minTownHall > 0) {
                let reqString = `Min. TH: ${dbClan.requirements.minTownHall}`;
                if (dbClan.requirements.minTrophies > 0) {
                    reqString += ` | Min. Trophies: ${dbClan.requirements.minTrophies}`;
                }

                embed.addFields({
                    name: 'Requirements',
                    value: reqString
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

    /**
     * Show clan selection menu
     */
    async showClanSelectionMenu(interaction, family) {
        // Create select menu options
        const options = family.clans.map(clan => {
            const roleEmoji = this.getRoleEmoji(clan.familyRole);
            return {
                label: clan.name,
                description: `${clan.familyRole.charAt(0).toUpperCase() + clan.familyRole.slice(1)} Clan`,
                value: clan.clanTag,
                emoji: roleEmoji
            };
        });

        // Create select menu
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('clan_select')
                    .setPlaceholder('Select a clan from your family')
                    .addOptions(options)
            );

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${family.familyName} - Clan Family`)
            .setDescription(`Select a clan to view its details`)
            .setFooter({ text: `This server has ${family.clans.length} clans in the family` });

        const message = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Create collector for response
        const filter = i => i.customId === 'clan_select' && i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            await i.deferUpdate();
            const selectedTag = i.values[0];

            try {
                // Get clan data
                const clanData = await clashApiService.getClan(selectedTag);

                // Create new embed
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

                // Add family info
                const clanInFamily = family.clans.find(c => c.clanTag === clanData.tag);
                if (clanInFamily) {
                    const roleEmoji = this.getRoleEmoji(clanInFamily.familyRole);
                    embed.addFields({
                        name: 'Family',
                        value: `${roleEmoji} ${family.familyName} (${clanInFamily.familyRole.charAt(0).toUpperCase() + clanInFamily.familyRole.slice(1)})`,
                        inline: true
                    });
                }

                // Update message with new embed
                await i.editReply({
                    embeds: [embed],
                    components: [] // Remove select menu
                });

                // Stop collector
                collector.stop();

            } catch (error) {
                console.error('Error fetching selected clan:', error);
                await i.editReply('An error occurred while fetching clan data. Please try again.');
                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                // If no selection was made, update the message
                await interaction.editReply({
                    content: 'No clan selected. Selection timed out.',
                    embeds: [],
                    components: []
                });
            }
        });
    },

    // Helper to get emoji for clan role
    getRoleEmoji(role) {
        switch (role) {
            case 'main': return '🏆';
            case 'feeder': return '🔄';
            case 'academy': return '🎓';
            case 'casual': return '🎮';
            default: return '🏰';
        }
    }
};