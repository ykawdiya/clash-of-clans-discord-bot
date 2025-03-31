// src/commands/admin/clanfamily.js - Enhanced version
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const clanFamilyService = require('../../services/clanFamilyService');
const roleSyncService = require('../../services/roleSyncService');
const clashApiService = require('../../services/clashApiService');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clanfamily')
        .setDescription('Manage clan families within your Discord server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new clan family')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name for your clan family')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('main_clan_tag')
                        .setDescription('Main clan tag (e.g. #ABC123)')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('main_clan_role')
                        .setDescription('Discord role for the main clan')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a clan to your family')
                .addStringOption(option =>
                    option.setName('clan_tag')
                        .setDescription('Clan tag to add (e.g. #ABC123)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Role in the family')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Main Clan', value: 'main' },
                            { name: 'Feeder Clan', value: 'feeder' },
                            { name: 'Academy', value: 'academy' },
                            { name: 'Casual', value: 'casual' },
                            { name: 'Other', value: 'other' }
                        ))
                .addRoleOption(option =>
                    option.setName('clan_role')
                        .setDescription('Discord role for this clan')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a clan from your family')
                .addStringOption(option =>
                    option.setName('clan_tag')
                        .setDescription('Clan tag to remove (e.g. #ABC123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all clans in your family'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('Show an overview of your clan family'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription('Rename your clan family')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('New name for your clan family')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Flag to indicate this command requires database access
    requiresDatabase: true,

    manualDeferring: true,

    async execute(interaction) {
        // Immediately defer reply to prevent timeout
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await this.createFamily(interaction);
                    break;
                case 'add':
                    await this.addClanToFamily(interaction);
                    break;
                case 'remove':
                    await this.removeClanFromFamily(interaction);
                    break;
                case 'list':
                    await this.listFamilyClans(interaction);
                    break;
                case 'overview':
                    await this.showFamilyOverview(interaction);
                    break;
                case 'rename':
                    await this.renameFamily(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in clanfamily command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'clan family management'));
        }
    },

    async createFamily(interaction) {
        // Get options
        const familyName = interaction.options.getString('name');
        let mainClanTag = interaction.options.getString('main_clan_tag');
        const mainClanRole = interaction.options.getRole('main_clan_role');

        // Validate clan tag
        const validation = validateTag(mainClanTag);
        if (!validation.valid) {
            return interaction.editReply(`❌ ${validation.message}`);
        }

        mainClanTag = validation.formattedTag;

        // Check if family already exists for this guild
        const existingFamily = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (existingFamily) {
            return interaction.editReply(`❌ This server already has a clan family: **${existingFamily.familyName}**. Use \`/clanfamily add\` to add more clans.`);
        }

        // Verify clan exists
        let clanData;
        try {
            clanData = await clashApiService.getClan(mainClanTag);
        } catch (error) {
            if (error.message.includes('404')) {
                return interaction.editReply('❌ Clan not found. Please check the tag and try again.');
            }
            throw error;
        }

        // Create the family
        try {
            const result = await clanFamilyService.createFamily(
                interaction.guild.id,
                familyName,
                mainClanTag
            );

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Clan Family Created')
                .setDescription(`Successfully created the **${familyName}** clan family!`)
                .addFields(
                    { name: 'Family Name', value: familyName, inline: true },
                    { name: 'Main Clan', value: result.mainClan.name, inline: true }
                )
                .setFooter({ text: `Family ID: ${result.familyId}` });

            // If a role was provided, set up the clan role mapping
            if (mainClanRole) {
                // Check role hierarchy first
                const bot = interaction.guild.members.me;
                const botRole = bot.roles.highest;

                if (botRole.position <= mainClanRole.position) {
                    embed.addFields({
                        name: '⚠️ Role Warning',
                        value: 'The clan role is positioned higher than my highest role. Please move this role below my role in the server settings for role assignment to work.'
                    });
                } else {
                    try {
                        // Associate the role with the clan
                        await roleSyncService.setClanRole(
                            interaction.guild.id,
                            mainClanTag,
                            mainClanRole.id
                        );

                        embed.addFields({
                            name: 'Clan Role',
                            value: `<@&${mainClanRole.id}> will be assigned to members of ${result.mainClan.name}`,
                            inline: true
                        });
                    } catch (error) {
                        console.error('Error setting clan role:', error);
                        embed.addFields({
                            name: '⚠️ Role Error',
                            value: `Failed to set up the clan role: ${error.message}`
                        });
                    }
                }
            }

            embed.addFields({
                name: 'Next Steps',
                value: 'You can now:\n1. Add more clans with `/clanfamily add`\n2. Set up position roles with `/rolesync setup`' +
                    (mainClanRole ? '' : '\n3. Set up clan roles with `/rolesync clan`')
            });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to create clan family:', error);
            return interaction.editReply(`❌ Error creating clan family: ${error.message}`);
        }
    },

    async addClanToFamily(interaction) {
        // Get options
        let clanTag = interaction.options.getString('clan_tag');
        const role = interaction.options.getString('role');
        const clanRole = interaction.options.getRole('clan_role');

        // Validate clan tag
        const validation = validateTag(clanTag);
        if (!validation.valid) {
            return interaction.editReply(`❌ ${validation.message}`);
        }

        clanTag = validation.formattedTag;

        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server. Create one first with `/clanfamily create`.');
        }

        // Verify clan exists
        let clanData;
        try {
            clanData = await clashApiService.getClan(clanTag);
        } catch (error) {
            if (error.message.includes('404')) {
                return interaction.editReply('❌ Clan not found. Please check the tag and try again.');
            }
            throw error;
        }

        // Add clan to family
        try {
            const result = await clanFamilyService.addClanToFamily(
                family.familyId,
                clanTag,
                role
            );

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Clan Added to Family')
                .setDescription(`Successfully added **${clanData.name}** to the **${family.familyName}** family!`)
                .addFields(
                    { name: 'Clan', value: clanData.name, inline: true },
                    { name: 'Tag', value: clanData.tag, inline: true },
                    { name: 'Role', value: role.charAt(0).toUpperCase() + role.slice(1), inline: true },
                    { name: 'Family', value: family.familyName, inline: true }
                );

            if (clanData.badgeUrls?.medium) {
                embed.setThumbnail(clanData.badgeUrls.medium);
            }

            // If a role was provided, set up the clan role mapping
            if (clanRole) {
                // Check role hierarchy first
                const bot = interaction.guild.members.me;
                const botRole = bot.roles.highest;

                if (botRole.position <= clanRole.position) {
                    embed.addFields({
                        name: '⚠️ Role Warning',
                        value: 'The clan role is positioned higher than my highest role. Please move this role below my role in the server settings for role assignment to work.'
                    });
                } else {
                    try {
                        // Associate the role with the clan
                        await roleSyncService.setClanRole(
                            interaction.guild.id,
                            clanTag,
                            clanRole.id
                        );

                        embed.addFields({
                            name: 'Clan Role',
                            value: `<@&${clanRole.id}> will be assigned to members of ${clanData.name}`,
                            inline: true
                        });
                    } catch (error) {
                        console.error('Error setting clan role:', error);
                        embed.addFields({
                            name: '⚠️ Role Error',
                            value: `Failed to set up the clan role: ${error.message}`
                        });
                    }
                }
            } else {
                embed.addFields({
                    name: 'Role Assignment',
                    value: 'To assign a Discord role to this clan, use `/rolesync clan`'
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to add clan to family:', error);
            return interaction.editReply(`❌ Error adding clan to family: ${error.message}`);
        }
    },

    // [Other methods remain the same as in the original implementation]
    async removeClanFromFamily(interaction) {
        // Get options
        let clanTag = interaction.options.getString('clan_tag');

        // Validate clan tag
        const validation = validateTag(clanTag);
        if (!validation.valid) {
            return interaction.editReply(`❌ ${validation.message}`);
        }

        clanTag = validation.formattedTag;

        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server.');
        }

        // Check if clan is in this family
        const clanInFamily = family.clans.find(clan => clan.clanTag === clanTag);
        if (!clanInFamily) {
            return interaction.editReply('❌ This clan is not part of your family.');
        }

        // If this is the main clan, check if it's the only clan
        if (clanInFamily.familyRole === 'main' && family.clans.length > 1) {
            return interaction.editReply('❌ Cannot remove the main clan while other clans are in the family. Remove other clans first or set a new main clan.');
        }

        // Remove clan from family
        try {
            await clanFamilyService.removeClanFromFamily(clanTag);

            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('Clan Removed from Family')
                .setDescription(`Successfully removed **${clanInFamily.name}** from the **${family.familyName}** family!`);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to remove clan from family:', error);
            return interaction.editReply(`❌ Error removing clan from family: ${error.message}`);
        }
    },

    async listFamilyClans(interaction) {
        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server. Create one first with `/clanfamily create`.');
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`${family.familyName} - Clan Family`)
            .setDescription(`This server has ${family.clans.length} clan${family.clans.length === 1 ? '' : 's'} in the family`)
            .setFooter({ text: `Family ID: ${family.familyId}` });

        // Add each clan as a field
        family.clans.forEach((clan, index) => {
            const roleEmoji = this.getRoleEmoji(clan.familyRole);
            const isPrimaryText = clan.isPrimary ? ' (Primary)' : '';

            embed.addFields({
                name: `${index + 1}. ${roleEmoji} ${clan.name}${isPrimaryText}`,
                value: `**Tag:** ${clan.clanTag}\n**Role:** ${clan.familyRole.charAt(0).toUpperCase() + clan.familyRole.slice(1)}`
            });
        });

        return interaction.editReply({ embeds: [embed] });
    },

    async showFamilyOverview(interaction) {
        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server. Create one first with `/clanfamily create`.');
        }

        // Fetch full overview with API data
        const overview = await clanFamilyService.getFamilyOverview(family.familyId);

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle(`${overview.stats.name} - Family Overview`)
            .setDescription(`Overview of all clans in the family`)
            .addFields(
                { name: 'Total Clans', value: overview.stats.totalClans.toString(), inline: true },
                { name: 'Total Members', value: overview.stats.totalMembers.toString(), inline: true },
                { name: 'Avg. Clan Level', value: overview.stats.averageClanLevel.toFixed(1), inline: true },
                { name: 'War Record', value: `${overview.stats.totalWarWins} wins (${overview.stats.winRate})`, inline: true }
            )
            .setFooter({ text: `Use /clanfamily list for detailed clan information` })
            .setTimestamp();

        // Add summary of each clan
        overview.clans.forEach(clan => {
            if (!clan.apiData) {
                embed.addFields({
                    name: `${this.getRoleEmoji(clan.familyRole)} ${clan.name}`,
                    value: `**Tag:** ${clan.clanTag}\n**Data unavailable**`
                });
                return;
            }

            const level = clan.apiData.clanLevel;
            const members = `${clan.apiData.members}/50`;
            const warRecord = `${clan.apiData.warWins || 0}W-${clan.apiData.warLosses || 0}L`;

            embed.addFields({
                name: `${this.getRoleEmoji(clan.familyRole)} ${clan.name}`,
                value: `**Level:** ${level} | **Members:** ${members} | **Wars:** ${warRecord}`
            });
        });

        return interaction.editReply({ embeds: [embed] });
    },

    async renameFamily(interaction) {
        // Get options
        const newName = interaction.options.getString('name');

        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server. Create one first with `/clanfamily create`.');
        }

        // Update family settings
        try {
            await clanFamilyService.updateFamilySettings(family.familyId, {
                familyName: newName
            });

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Family Renamed')
                .setDescription(`Successfully renamed the clan family from **${family.familyName}** to **${newName}**!`);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to rename clan family:', error);
            return interaction.editReply(`❌ Error renaming clan family: ${error.message}`);
        }
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