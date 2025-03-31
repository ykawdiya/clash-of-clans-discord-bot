// src/commands/admin/rolesync.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Clan = require('../../models/Clan');
const clanFamilyService = require('../../services/clanFamilyService');
const roleSyncService = require('../../services/roleSyncService');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolesync')
        .setDescription('Configure automatic role synchronization based on Clash of Clans roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up role mapping')
                .addRoleOption(option =>
                    option.setName('leader_role')
                        .setDescription('Discord role for clan leaders')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('coleader_role')
                        .setDescription('Discord role for clan co-leaders')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('elder_role')
                        .setDescription('Discord role for clan elders')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('member_role')
                        .setDescription('Discord role for clan members')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clan')
                .setDescription('Set up clan-specific roles')
                .addStringOption(option =>
                    option.setName('clan_tag')
                        .setDescription('Clan tag (e.g. #ABC123)')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('clan_role')
                        .setDescription('Discord role for this clan')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('townhall')
                .setDescription('Set up Town Hall level roles')
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Town Hall level (1-15)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(15))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Discord role for this Town Hall level')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable automatic role synchronization')
                .addIntegerOption(option =>
                    option.setName('frequency')
                        .setDescription('How often to sync roles (in hours)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(24)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable automatic role synchronization'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Run role synchronization manually'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check role synchronization status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Flag to indicate this command requires database access
    requiresDatabase: true,

    manualDeferring: true,

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'setup':
                    await this.setupRoleMappings(interaction);
                    break;
                case 'clan':
                    await this.setupClanRole(interaction);
                    break;
                case 'townhall':
                    await this.setupTownHallRole(interaction);
                    break;
                case 'enable':
                    await this.enableRoleSync(interaction);
                    break;
                case 'disable':
                    await this.disableRoleSync(interaction);
                    break;
                case 'sync':
                    await this.syncRoles(interaction);
                    break;
                case 'status':
                    await this.showStatus(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in rolesync command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'role synchronization'));
        }
    },

    async setupRoleMappings(interaction) {
        // Get options
        const leaderRole = interaction.options.getRole('leader_role');
        const coleaderRole = interaction.options.getRole('coleader_role');
        const elderRole = interaction.options.getRole('elder_role');
        const memberRole = interaction.options.getRole('member_role');

        // Validate role hierarchy
        const bot = interaction.guild.members.me;
        const botRole = bot.roles.highest;

        const canManageRoles = [leaderRole, coleaderRole, elderRole, memberRole].every(role => {
            return botRole.position > role.position;
        });

        if (!canManageRoles) {
            return interaction.editReply('❌ Some roles are positioned higher than my highest role. Please move these roles below my role in the server settings.');
        }

        // Get or create role sync settings
        try {
            // Check if we need to get family or individual clan
            const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);

            if (family) {
                // Set up role mappings for all clans in family
                await Promise.all(family.clans.map(async (clan) => {
                    await roleSyncService.setRoleMappings(
                        interaction.guild.id,
                        clan.clanTag,
                        {
                            leader: leaderRole.id,
                            coLeader: coleaderRole.id,
                            elder: elderRole.id,
                            member: memberRole.id
                        }
                    );
                }));

                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ Role Sync Setup Complete')
                    .setDescription(`Successfully set up role mappings for all ${family.clans.length} clans in the family!`)
                    .addFields(
                        { name: 'Leader Role', value: `<@&${leaderRole.id}>`, inline: true },
                        { name: 'Co-Leader Role', value: `<@&${coleaderRole.id}>`, inline: true },
                        { name: 'Elder Role', value: `<@&${elderRole.id}>`, inline: true },
                        { name: 'Member Role', value: `<@&${memberRole.id}>`, inline: true },
                        { name: 'Next Steps', value: 'Set up clan-specific roles with `/rolesync clan` and enable sync with `/rolesync enable`' }
                    );

                return interaction.editReply({ embeds: [embed] });
            } else {
                // Try to find a single clan
                const clan = await Clan.findOne({ guildId: interaction.guild.id });

                if (!clan) {
                    return interaction.editReply('❌ No clan found for this server. Please set up a clan using `/setclan` first.');
                }

                // Set up role mappings for this clan
                await roleSyncService.setRoleMappings(
                    interaction.guild.id,
                    clan.clanTag,
                    {
                        leader: leaderRole.id,
                        coLeader: coleaderRole.id,
                        elder: elderRole.id,
                        member: memberRole.id
                    }
                );

                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ Role Sync Setup Complete')
                    .setDescription(`Successfully set up role mappings for ${clan.name}!`)
                    .addFields(
                        { name: 'Leader Role', value: `<@&${leaderRole.id}>`, inline: true },
                        { name: 'Co-Leader Role', value: `<@&${coleaderRole.id}>`, inline: true },
                        { name: 'Elder Role', value: `<@&${elderRole.id}>`, inline: true },
                        { name: 'Member Role', value: `<@&${memberRole.id}>`, inline: true },
                        { name: 'Next Steps', value: 'Enable sync with `/rolesync enable`' }
                    );

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Failed to set up role mappings:', error);
            return interaction.editReply(`❌ Error setting up role mappings: ${error.message}`);
        }
    },

    async setupClanRole(interaction) {
        // Get options
        const clanTag = interaction.options.getString('clan_tag');
        const clanRole = interaction.options.getRole('clan_role');

        // Validate bot can manage the role
        const bot = interaction.guild.members.me;
        const botRole = bot.roles.highest;

        if (botRole.position <= clanRole.position) {
            return interaction.editReply('❌ The clan role is positioned higher than my highest role. Please move this role below my role in the server settings.');
        }

        // Find the clan
        const clan = await Clan.findOne({ clanTag });
        if (!clan) {
            return interaction.editReply('❌ Clan not found. Please check the tag or add this clan to your server first.');
        }

        // Set up clan role mapping
        try {
            await roleSyncService.setClanRole(
                interaction.guild.id,
                clanTag,
                clanRole.id
            );

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Clan Role Setup Complete')
                .setDescription(`Successfully set up role mapping for ${clan.name}!`)
                .addFields(
                    { name: 'Clan', value: clan.name, inline: true },
                    { name: 'Tag', value: clan.clanTag, inline: true },
                    { name: 'Role', value: `<@&${clanRole.id}>`, inline: true }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to set up clan role mapping:', error);
            return interaction.editReply(`❌ Error setting up clan role: ${error.message}`);
        }
    },

    async setupTownHallRole(interaction) {
        // Get options
        const thLevel = interaction.options.getInteger('level');
        const thRole = interaction.options.getRole('role');

        // Validate bot can manage the role
        const bot = interaction.guild.members.me;
        const botRole = bot.roles.highest;

        if (botRole.position <= thRole.position) {
            return interaction.editReply('❌ The Town Hall role is positioned higher than my highest role. Please move this role below my role in the server settings.');
        }

        // Set up Town Hall role mapping
        try {
            await roleSyncService.setTownHallRole(
                interaction.guild.id,
                thLevel,
                thRole.id
            );

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Town Hall Role Setup Complete')
                .setDescription(`Successfully set up role mapping for Town Hall ${thLevel}!`)
                .addFields(
                    { name: 'Town Hall', value: `Level ${thLevel}`, inline: true },
                    { name: 'Role', value: `<@&${thRole.id}>`, inline: true }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to set up Town Hall role mapping:', error);
            return interaction.editReply(`❌ Error setting up Town Hall role: ${error.message}`);
        }
    },

    async enableRoleSync(interaction) {
        // Get options
        const frequency = interaction.options.getInteger('frequency') || 6; // Default 6 hours

        // Enable role sync
        try {
            await roleSyncService.enableRoleSync(
                interaction.guild.id,
                frequency
            );

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Role Sync Enabled')
                .setDescription(`Successfully enabled automatic role synchronization!`)
                .addFields(
                    { name: 'Frequency', value: `Every ${frequency} hour${frequency === 1 ? '' : 's'}`, inline: true },
                    { name: 'Next Sync', value: 'Scheduled for the next cycle', inline: true },
                    { name: 'Manual Sync', value: 'You can run a manual sync with `/rolesync sync`' }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to enable role sync:', error);
            return interaction.editReply(`❌ Error enabling role sync: ${error.message}`);
        }
    },

    async disableRoleSync(interaction) {
        // Disable role sync
        try {
            await roleSyncService.disableRoleSync(interaction.guild.id);

            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('Role Sync Disabled')
                .setDescription(`Automatic role synchronization has been disabled.`)
                .addFields(
                    { name: 'Manual Sync', value: 'You can still run a manual sync with `/rolesync sync`' },
                    { name: 'Re-enable', value: 'Use `/rolesync enable` to re-enable automatic synchronization' }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to disable role sync:', error);
            return interaction.editReply(`❌ Error disabling role sync: ${error.message}`);
        }
    },

    async syncRoles(interaction) {
        await interaction.editReply('🔄 Starting role synchronization...');

        try {
            // Run role sync
            const result = await roleSyncService.syncRoles(interaction.guild.id);

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Role Sync Complete')
                .setDescription(`Successfully synchronized roles for ${result.totalUsers} users!`)
                .addFields(
                    { name: 'Updated Users', value: result.updatedUsers.toString(), inline: true },
                    { name: 'Skipped Users', value: result.skippedUsers.toString(), inline: true },
                    { name: 'Failed Updates', value: result.failedUsers.toString(), inline: true },
                    { name: 'Details', value: result.details }
                )
                .setFooter({ text: `Completed in ${result.executionTime}ms` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to sync roles:', error);
            return interaction.editReply(`❌ Error synchronizing roles: ${error.message}`);
        }
    },

    async showStatus(interaction) {
        try {
            // Get role sync status
            const status = await roleSyncService.getRoleSyncStatus(interaction.guild.id);

            // Determine status color
            let color = '#e74c3c'; // Red by default (disabled)
            if (status.enabled) {
                color = '#2ecc71'; // Green (enabled and working)
                if (status.lastSyncFailed) {
                    color = '#f39c12'; // Orange (enabled but last sync failed)
                }
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('Role Sync Status')
                .addFields(
                    { name: 'Enabled', value: status.enabled ? 'Yes ✅' : 'No ❌', inline: true },
                    { name: 'Frequency', value: status.enabled ? `Every ${status.frequency} hour${status.frequency === 1 ? '' : 's'}` : 'N/A', inline: true },
                    { name: 'Last Sync', value: status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never', inline: true },
                    { name: 'Last Sync Result', value: status.lastSyncFailed ? 'Failed ❌' : (status.lastSync ? 'Success ✅' : 'N/A'), inline: true },
                    { name: 'Linked Clans', value: status.clansWithRoles.toString(), inline: true },
                    { name: 'TH Roles', value: status.townHallRoles ? 'Configured ✅' : 'Not configured ❌', inline: true }
                );

            // Add role mappings if available
            if (status.roleNames) {
                const roleText = Object.entries(status.roleNames)
                    .map(([role, id]) => `${role}: ${id ? `<@&${id}>` : 'Not set'}`)
                    .join('\n');

                embed.addFields({ name: 'Role Mappings', value: roleText });
            }

            // Add clan role mappings if available
            if (status.clanRoles && status.clanRoles.length > 0) {
                const clanRoleText = status.clanRoles
                    .map(cr => `${cr.clanName}: <@&${cr.roleId}>`)
                    .join('\n');

                embed.addFields({ name: 'Clan Roles', value: clanRoleText });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to get role sync status:', error);
            return interaction.editReply(`❌ Error getting role sync status: ${error.message}`);
        }
    }
};