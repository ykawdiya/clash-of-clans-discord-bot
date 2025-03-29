// src/commands/admin/roles.js - Improved version
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define role types and configurations
const ROLE_TYPES = {
    TH_LEVEL: 'th_level',
    CLAN_ROLE: 'clan_role',
    WAR_ACTIVITY: 'war_activity',
    DONATION_TIER: 'donation_tier'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Configure and assign roles based on Clash of Clans data')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up automatic role assignments')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of roles to set up')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Town Hall Level', value: ROLE_TYPES.TH_LEVEL },
                            { name: 'Clan Role', value: ROLE_TYPES.CLAN_ROLE },
                            { name: 'War Activity', value: ROLE_TYPES.WAR_ACTIVITY },
                            { name: 'Donation Tier', value: ROLE_TYPES.DONATION_TIER }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync roles for all linked members'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Show current role configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    category: 'Admin',

    manualDeferring: true,

    longDescription: 'Configure automatic role assignments based on Clash of Clans data. Assign roles based on town hall level, clan role (Elder, Co-Leader), war activity, or donation tiers.',

    examples: [
        '/roles setup type:th_level',
        '/roles setup type:clan_role',
        '/roles sync',
        '/roles show'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Check if bot has permission to manage roles
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.editReply({
                    content: '❌ I do not have permission to manage roles in this server. Please give me the "Manage Roles" permission.',
                    ephemeral: true
                });
            }

            // Check if bot role is high enough in hierarchy
            const botRolePosition = interaction.guild.members.me.roles.highest.position;
            if (botRolePosition < 1) {
                return interaction.editReply({
                    content: '❌ My role is too low in the server hierarchy. Please move my role higher to allow me to manage other roles.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            // Find linked clan for this Discord server
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan) {
                return interaction.editReply({
                    content: "This server doesn't have a linked clan. Use `/setclan` first.",
                    ephemeral: true
                });
            }

            // Make sure settings object exists
            if (!linkedClan.settings) {
                linkedClan.settings = {};
            }

            switch (subcommand) {
                case 'setup':
                    await setupRoles(interaction, linkedClan);
                    break;
                case 'sync':
                    await syncRoles(interaction, linkedClan);
                    break;
                case 'show':
                    await showRoleConfig(interaction, linkedClan);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in roles command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'roles command'));
        }
    },
};

/**
 * Set up role assignments
 */
async function setupRoles(interaction, linkedClan) {
    const roleType = interaction.options.getString('type');

    // Initialize roles configuration if it doesn't exist
    if (!linkedClan.settings.roles) {
        linkedClan.settings.roles = {};
    }

    try {
        switch (roleType) {
            case ROLE_TYPES.TH_LEVEL:
                await setupTownHallRoles(interaction, linkedClan);
                break;
            case ROLE_TYPES.CLAN_ROLE:
                await setupClanRoles(interaction, linkedClan);
                break;
            case ROLE_TYPES.WAR_ACTIVITY:
                await setupWarActivityRoles(interaction, linkedClan);
                break;
            case ROLE_TYPES.DONATION_TIER:
                await setupDonationRoles(interaction, linkedClan);
                break;
            default:
                return interaction.editReply('Invalid role type selected.');
        }
    } catch (error) {
        console.error(`Error in setupRoles (${roleType}):`, error);
        throw new Error(`Failed to set up ${roleType} roles: ${error.message}`);
    }
}

/**
 * Set up Town Hall level roles
 */
async function setupTownHallRoles(interaction, linkedClan) {
    // Create roles for TH7-15 if they don't exist
    const thRoles = {};

    // Emoji mapping for town hall levels
    const thEmojis = {
        7: '7️⃣',
        8: '8️⃣',
        9: '9️⃣',
        10: '🔟',
        11: '1️⃣1️⃣',
        12: '1️⃣2️⃣',
        13: '1️⃣3️⃣',
        14: '1️⃣4️⃣',
        15: '1️⃣5️⃣'
    };

    // Status update to user
    await interaction.editReply('Creating Town Hall roles... This may take a moment.');

    // Create or find roles for each TH level
    for (let thLevel = 7; thLevel <= 15; thLevel++) {
        const roleName = `TH${thLevel}`;
        try {
            let role = interaction.guild.roles.cache.find(r => r.name === roleName);

            if (!role) {
                // Create a new role with a color based on TH level (increasingly vibrant)
                // Color hue shifts from red (0) to yellow (60) as TH level increases
                const hue = Math.min(60, (thLevel - 7) * 10);
                const color = hslToHex(hue, 100, 60);

                role = await interaction.guild.roles.create({
                    name: roleName,
                    color: color,
                    reason: 'Clash of Clans bot TH level role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleName} with color ${color}`);
            } else {
                console.log(`Using existing role ${roleName}`);
            }

            // Store role ID with emoji
            thRoles[thLevel] = {
                id: role.id,
                emoji: thEmojis[thLevel] || `TH${thLevel}`
            };
        } catch (roleError) {
            console.error(`Failed to create/find role ${roleName}:`, roleError);
            // Continue with other roles
        }
    }

    // Save to database
    linkedClan.settings.roles = linkedClan.settings.roles || {};
    linkedClan.settings.roles.townHall = thRoles;

    try {
        await linkedClan.save();
    } catch (saveError) {
        console.error('Error saving clan settings:', saveError);
        throw new Error(`Database error: ${saveError.message}`);
    }

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Town Hall Roles Setup Complete')
        .setDescription('I have set up the following Town Hall level roles:')
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

    // Add each role to the embed
    for (let thLevel = 7; thLevel <= 15; thLevel++) {
        const role = thRoles[thLevel];
        if (role && role.id) {
            embed.addFields({
                name: `${role.emoji} Town Hall ${thLevel}`,
                value: `<@&${role.id}>`,
                inline: true
            });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set up clan role roles (Member, Elder, Co-Leader, Leader)
 */
async function setupClanRoles(interaction, linkedClan) {
    // Define clan roles with their colors
    const clanRoleDefinitions = [
        { name: 'Leader', color: '#e74c3c', clanRole: 'leader' },
        { name: 'Co-Leader', color: '#e67e22', clanRole: 'coLeader' },
        { name: 'Elder', color: '#f1c40f', clanRole: 'elder' },
        { name: 'Member', color: '#3498db', clanRole: 'member' }
    ];

    const clanRoles = {};

    // Status update to user
    await interaction.editReply('Creating Clan roles... This may take a moment.');

    // Create or find roles
    for (const roleDef of clanRoleDefinitions) {
        try {
            let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

            if (!role) {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot clan role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } else {
                console.log(`Using existing role ${roleDef.name}`);
            }

            // Store role ID
            clanRoles[roleDef.clanRole] = role.id;
        } catch (roleError) {
            console.error(`Failed to create/find role ${roleDef.name}:`, roleError);
            // Continue with other roles
        }
    }

    // Save to database
    linkedClan.settings.roles = linkedClan.settings.roles || {};
    linkedClan.settings.roles.clanRole = clanRoles;

    try {
        await linkedClan.save();
    } catch (saveError) {
        console.error('Error saving clan settings:', saveError);
        throw new Error(`Database error: ${saveError.message}`);
    }

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Clan Roles Setup Complete')
        .setDescription('I have set up the following clan roles:')
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

    // Add fields for roles that were successfully created
    if (clanRoles.leader) {
        embed.addFields({ name: 'Leader', value: `<@&${clanRoles.leader}>`, inline: true });
    }
    if (clanRoles.coLeader) {
        embed.addFields({ name: 'Co-Leader', value: `<@&${clanRoles.coLeader}>`, inline: true });
    }
    if (clanRoles.elder) {
        embed.addFields({ name: 'Elder', value: `<@&${clanRoles.elder}>`, inline: true });
    }
    if (clanRoles.member) {
        embed.addFields({ name: 'Member', value: `<@&${clanRoles.member}>`, inline: true });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set up war activity roles
 */
async function setupWarActivityRoles(interaction, linkedClan) {
    // Define war activity roles
    const warRoleDefinitions = [
        { name: 'War Hero', color: '#e74c3c', minStars: 1000 },
        { name: 'War Veteran', color: '#e67e22', minStars: 500 },
        { name: 'War Regular', color: '#f1c40f', minStars: 200 },
        { name: 'War Participant', color: '#3498db', minStars: 50 }
    ];

    const warRoles = {};

    // Status update to user
    await interaction.editReply('Creating War Activity roles... This may take a moment.');

    // Create or find roles
    for (const roleDef of warRoleDefinitions) {
        try {
            let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

            if (!role) {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot war activity role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } else {
                console.log(`Using existing role ${roleDef.name}`);
            }

            // Store role ID with minimum stars
            warRoles[role.id] = { minStars: roleDef.minStars };
        } catch (roleError) {
            console.error(`Failed to create/find role ${roleDef.name}:`, roleError);
            // Continue with other roles
        }
    }

    // Save to database
    linkedClan.settings.roles = linkedClan.settings.roles || {};
    linkedClan.settings.roles.warActivity = warRoles;

    try {
        await linkedClan.save();
    } catch (saveError) {
        console.error('Error saving clan settings:', saveError);
        throw new Error(`Database error: ${saveError.message}`);
    }

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Activity Roles Setup Complete')
        .setDescription('I have set up the following war activity roles:')
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

    // Add each role to the embed
    for (const [roleId, config] of Object.entries(warRoles)) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
            embed.addFields({
                name: role.name,
                value: `${config.minStars}+ war stars required`,
                inline: true
            });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set up donation tier roles
 */
async function setupDonationRoles(interaction, linkedClan) {
    // Define donation tier roles
    const donationRoleDefinitions = [
        { name: 'Legendary Donor', color: '#9b59b6', minDonations: 10000 },
        { name: 'Epic Donor', color: '#e74c3c', minDonations: 5000 },
        { name: 'Super Donor', color: '#e67e22', minDonations: 2000 },
        { name: 'Active Donor', color: '#f1c40f', minDonations: 1000 }
    ];

    const donationRoles = {};

    // Status update to user
    await interaction.editReply('Creating Donation Tier roles... This may take a moment.');

    // Create or find roles
    for (const roleDef of donationRoleDefinitions) {
        try {
            let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

            if (!role) {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot donation tier role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } else {
                console.log(`Using existing role ${roleDef.name}`);
            }

            // Store role ID with minimum donations
            donationRoles[role.id] = { minDonations: roleDef.minDonations };
        } catch (roleError) {
            console.error(`Failed to create/find role ${roleDef.name}:`, roleError);
            // Continue with other roles
        }
    }

    // Save to database
    linkedClan.settings.roles = linkedClan.settings.roles || {};
    linkedClan.settings.roles.donationTier = donationRoles;

    try {
        await linkedClan.save();
    } catch (saveError) {
        console.error('Error saving clan settings:', saveError);
        throw new Error(`Database error: ${saveError.message}`);
    }

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Donation Tier Roles Setup Complete')
        .setDescription('I have set up the following donation tier roles:')
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

    // Add each role to the embed
    for (const [roleId, config] of Object.entries(donationRoles)) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
            embed.addFields({
                name: role.name,
                value: `${config.minDonations}+ troops donated`,
                inline: true
            });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Check if bot can manage roles for a specific member
 * @param {GuildMember} botMember
 * @param {GuildMember} targetMember
 * @returns {boolean}
 */
function canManageRolesFor(botMember, targetMember) {
    // Check if the bot has manage roles permission
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return false;
    }

    // Check if the bot's highest role is above the target's highest role
    return botMember.roles.highest.position > targetMember.roles.highest.position;
}

/**
 * Sync roles for all linked members
 */
async function syncRoles(interaction, linkedClan) {
    // Check if role settings exist
    if (!linkedClan.settings || !linkedClan.settings.roles) {
        return interaction.editReply('No role configuration found. Use `/roles setup` first.');
    }

    // Status update to user
    await interaction.editReply('Starting role synchronization...');

    try {
        // Check if bot has permissions to manage roles
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.editReply('❌ I don\'t have permission to manage roles. Please give me the "Manage Roles" permission.');
        }

        // Check bot's highest role position
        const botHighestRole = botMember.roles.highest;
        console.log(`Bot's highest role: ${botHighestRole.name} (Position: ${botHighestRole.position})`);

        // Get all linked users
        const linkedUsers = await User.find({ discordId: { $exists: true } });
        if (linkedUsers.length === 0) {
            return interaction.editReply('No linked users found. Members need to use `/link` to connect their accounts.');
        }

        console.log(`Found ${linkedUsers.length} linked users to process`);

        // Get clan data
        const clanData = await clashApiService.getClan(linkedClan.clanTag);
        if (!clanData) {
            return interaction.editReply('Could not fetch clan data. Please try again later.');
        }

        console.log(`Successfully fetched clan data for ${clanData.name} (${clanData.tag})`);

        // Check if clan data includes members
        if (!clanData.memberList || clanData.memberList.length === 0) {
            console.log('Warning: Clan data does not contain member list');
        } else {
            console.log(`Clan has ${clanData.memberList.length} members`);
        }

        // Track results
        const results = {
            success: 0,
            failed: 0,
            notInServer: 0,
            notInClan: 0,
            roleErrors: 0
        };

        // Progress update
        await interaction.editReply(`Found ${linkedUsers.length} linked users. Synchronizing roles...`);

        // Log role configurations
        console.log('Role configurations:');
        console.log('TH Roles:', JSON.stringify(linkedClan.settings.roles.townHall || 'Not configured'));
        console.log('Clan Roles:', JSON.stringify(linkedClan.settings.roles.clanRole || 'Not configured'));
        console.log('War Roles:', JSON.stringify(linkedClan.settings.roles.warActivity || 'Not configured'));
        console.log('Donation Roles:', JSON.stringify(linkedClan.settings.roles.donationTier || 'Not configured'));

        // Process each linked user
        for (const user of linkedUsers) {
            if (!user.playerTag) {
                console.log(`Skipping user ${user.discordId} - no player tag`);
                continue;
            }

            try {
                console.log(`Processing user ${user.discordId} with player tag ${user.playerTag}`);

                // Get member from the guild
                const member = await interaction.guild.members.fetch(user.discordId).catch(e => {
                    console.log(`Error fetching member ${user.discordId}: ${e.message}`);
                    return null;
                });

                if (!member) {
                    console.log(`User ${user.discordId} is not in this server`);
                    results.notInServer++;
                    continue;
                }

                // Get player data
                const playerData = await clashApiService.getPlayer(user.playerTag).catch(e => {
                    console.log(`Error fetching player data for ${user.playerTag}: ${e.message}`);
                    return null;
                });

                if (!playerData) {
                    console.log(`Could not fetch player data for ${user.playerTag}`);
                    results.failed++;
                    continue;
                }

                console.log(`Got player data for ${playerData.name} (${playerData.tag}), TH${playerData.townHallLevel}, Role: "${playerData.role || 'member'}"`);

                // Check if player is in the linked clan
                const isInClan = playerData.clan && playerData.clan.tag === linkedClan.clanTag;
                console.log(`Player ${playerData.name} in clan: ${isInClan}`);

                // Find the player in the clan members list to get donations
                let clanMemberData = null;
                if (isInClan && clanData.memberList) {
                    clanMemberData = clanData.memberList.find(m => m.tag === playerData.tag);
                    if (clanMemberData) {
                        console.log(`Found clan member data for ${playerData.name} - Donations: ${clanMemberData.donations || 0}`);
                    } else {
                        console.log(`Could not find clan member data for ${playerData.name} in memberList`);
                    }
                }

                if (!isInClan) {
                    console.log(`${playerData.name} is not in clan ${linkedClan.name}, removing roles`);
                    results.notInClan++;
                    // Remove clan-related roles if configured
                    await removeAllClanRoles(member, linkedClan.settings.roles);
                    continue;
                }

                // Check if bot can manage the member's roles
                if (!canManageRolesFor(botMember, member)) {
                    console.log(`Cannot manage roles for ${member.user.tag} - hierarchy issue`);
                    results.roleErrors++;
                    continue;
                }

                // Assign roles based on configurations
                await assignAllRoles(member, playerData, clanMemberData, linkedClan.settings.roles);
                console.log(`Successfully updated roles for ${playerData.name}`);
                results.success++;
            } catch (error) {
                console.error(`Failed to sync roles for user ${user.discordId}:`, error);
                results.failed++;
            }
        }

        // Create result embed
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Role Synchronization Complete')
            .setDescription(`Synchronized roles for ${results.success} members`)
            .addFields(
                { name: 'Successful', value: results.success.toString(), inline: true },
                { name: 'Failed', value: results.failed.toString(), inline: true },
                { name: 'Not in Server', value: results.notInServer.toString(), inline: true },
                { name: 'Not in Clan', value: results.notInClan.toString(), inline: true },
                { name: 'Role Permission Errors', value: results.roleErrors.toString(), inline: true }
            );

        if (results.success === 0) {
            embed.setColor('#ff0000')
                .addFields({
                    name: 'Troubleshooting',
                    value: 'No roles were assigned. This may be due to:\n' +
                        '• Bot role is below the roles it\'s trying to assign\n' +
                        '• Missing "Manage Roles" permission\n' +
                        '• Invalid role configurations\n' +
                        'Check the bot logs for more details.'
                });
        }

        return interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
        console.error('Error in syncRoles:', error);
        return interaction.editReply(`Failed to sync roles: ${error.message}\nCheck server logs for details.`);
    }
}

/**
 * Show current role configuration
 */
async function showRoleConfig(interaction, linkedClan) {
    // Check if role settings exist
    if (!linkedClan.settings || !linkedClan.settings.roles) {
        return interaction.editReply('No role configuration found. Use `/roles setup` first.');
    }

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Role Configuration')
        .setDescription(`Role configuration for ${linkedClan.name} (${linkedClan.clanTag})`);

    // Add Town Hall roles if configured
    if (linkedClan.settings.roles.townHall) {
        let thRolesText = '';
        for (const [level, config] of Object.entries(linkedClan.settings.roles.townHall)) {
            try {
                const role = interaction.guild.roles.cache.get(config.id);
                if (role) {
                    thRolesText += `TH${level}: ${role.name} <@&${role.id}>\n`;
                }
            } catch (error) {
                console.error(`Error getting role for TH${level}:`, error);
            }
        }

        if (thRolesText) {
            embed.addFields({ name: 'Town Hall Roles', value: thRolesText });
        }
    }

    // Add clan roles if configured
    if (linkedClan.settings.roles.clanRole) {
        let clanRolesText = '';
        for (const [role, id] of Object.entries(linkedClan.settings.roles.clanRole)) {
            try {
                const discordRole = interaction.guild.roles.cache.get(id);
                if (discordRole) {
                    clanRolesText += `${role.charAt(0).toUpperCase() + role.slice(1)}: ${discordRole.name} <@&${discordRole.id}>\n`;
                }
            } catch (error) {
                console.error(`Error getting role for ${role}:`, error);
            }
        }

        if (clanRolesText) {
            embed.addFields({ name: 'Clan Roles', value: clanRolesText });
        }
    }

    // Add war activity roles if configured
    if (linkedClan.settings.roles.warActivity) {
        let warRolesText = '';
        for (const [roleId, config] of Object.entries(linkedClan.settings.roles.warActivity)) {
            try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    warRolesText += `${role.name}: ${config.minStars}+ war stars\n`;
                }
            } catch (error) {
                console.error(`Error getting war activity role:`, error);
            }
        }

        if (warRolesText) {
            embed.addFields({ name: 'War Activity Roles', value: warRolesText });
        }
    }

    // Add donation tier roles if configured
    if (linkedClan.settings.roles.donationTier) {
        let donationRolesText = '';
        for (const [roleId, config] of Object.entries(linkedClan.settings.roles.donationTier)) {
            try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    donationRolesText += `${role.name}: ${config.minDonations}+ donations\n`;
                }
            } catch (error) {
                console.error(`Error getting donation tier role:`, error);
            }
        }

        if (donationRolesText) {
            embed.addFields({ name: 'Donation Tier Roles', value: donationRolesText });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Helper functions
 */

/**
 * Assign all applicable roles to a member
 */
async function assignAllRoles(member, playerData, clanMemberData, roleConfig) {
    try {
        // Debug info
        console.log(`Starting role assignment for ${member.user.tag}`);

        // Handle TH level roles
        if (roleConfig.townHall) {
            console.log(`Assigning TH${playerData.townHallLevel} role to ${member.user.tag}`);
            await assignTownHallRole(member, playerData.townHallLevel, roleConfig.townHall);
        } else {
            console.log('Town Hall roles not configured, skipping');
        }

        // Handle clan roles
        if (roleConfig.clanRole) {
            const role = playerData.role || 'member';
            console.log(`Assigning clan role "${role}" to ${member.user.tag}`);
            await assignClanRole(member, role, roleConfig.clanRole);
        } else {
            console.log('Clan roles not configured, skipping');
        }

        // Handle war activity roles
        if (roleConfig.warActivity) {
            const warStars = playerData.warStars || 0;
            console.log(`Assigning war activity role based on ${warStars} stars to ${member.user.tag}`);
            await assignWarActivityRole(member, warStars, roleConfig.warActivity);
        } else {
            console.log('War activity roles not configured, skipping');
        }

        // Handle donation tier roles
        if (roleConfig.donationTier && clanMemberData) {
            const donations = clanMemberData.donations || 0;
            console.log(`Assigning donation tier role based on ${donations} donations to ${member.user.tag}`);
            await assignDonationRole(member, donations, roleConfig.donationTier);
        } else {
            console.log('Donation tier roles not configured or no clan member data, skipping');
        }

        console.log(`Completed role assignment for ${member.user.tag}`);
    } catch (error) {
        console.error(`Error in assignAllRoles for ${member.user.tag}:`, error);
        throw new Error(`Role assignment failed: ${error.message}`);
    }
}

/**
 * Remove all clan-related roles when a player is no longer in the clan
 */
async function removeAllClanRoles(member, roleConfig) {
    try {
        // Get all role IDs to remove
        const rolesToRemove = new Set();

        // Add town hall roles
        if (roleConfig.townHall) {
            Object.values(roleConfig.townHall).forEach(config => {
                if (config && config.id) rolesToRemove.add(config.id);
            });
        }

        // Add clan roles
        if (roleConfig.clanRole) {
            Object.values(roleConfig.clanRole).forEach(roleId => {
                if (roleId) rolesToRemove.add(roleId);
            });
        }

        // Add war activity roles
        if (roleConfig.warActivity) {
            Object.keys(roleConfig.warActivity).forEach(roleId => {
                if (roleId) rolesToRemove.add(roleId);
            });
        }

        // Add donation tier roles
        if (roleConfig.donationTier) {
            Object.keys(roleConfig.donationTier).forEach(roleId => {
                if (roleId) rolesToRemove.add(roleId);
            });
        }

        // Remove roles that the member has
        const rolesToActuallyRemove = member.roles.cache
            .filter(role => rolesToRemove.has(role.id))
            .map(role => role.id);

        if (rolesToActuallyRemove.length > 0) {
            await member.roles.remove(rolesToActuallyRemove, 'Player no longer in clan');
            console.log(`Removed ${rolesToActuallyRemove.length} roles from ${member.user.tag}`);
        }
    } catch (error) {
        console.error(`Error in removeAllClanRoles for ${member.user.tag}:`, error);
        throw new Error(`Role removal failed: ${error.message}`);
    }
}

/**
 * Assign appropriate town hall role
 */
async function assignTownHallRole(member, townHallLevel, thRoleConfig) {
    try {
        console.log(`Starting TH role assignment for ${member.user.tag}, TH${townHallLevel}`);

        // Check if config for this TH level exists
        if (!thRoleConfig[townHallLevel]) {
            console.log(`No role config found for TH${townHallLevel}`);
            return;
        }

        const roleId = thRoleConfig[townHallLevel].id;
        if (!roleId) {
            console.log(`Role ID missing for TH${townHallLevel}`);
            return;
        }

        // Verify role exists
        const role = member.guild.roles.cache.get(roleId);
        if (!role) {
            console.log(`Role with ID ${roleId} not found in server for TH${townHallLevel}`);
            return;
        }

        console.log(`Found role ${role.name} (${role.id}) for TH${townHallLevel}`);

        // Check if already has the role
        if (member.roles.cache.has(roleId)) {
            console.log(`${member.user.tag} already has TH${townHallLevel} role ${role.name}`);
            return;
        }

        // Get all TH role IDs to remove
        console.log('Getting list of all TH roles to remove');
        const allThRoleIds = Object.values(thRoleConfig)
            .filter(config => config && config.id)
            .map(config => config.id);

        console.log(`Found ${allThRoleIds.length} total TH roles`);

        // Remove all other TH roles first
        const currentThRoles = member.roles.cache
            .filter(role => allThRoleIds.includes(role.id) && role.id !== roleId)
            .map(role => role.id);

        if (currentThRoles.length > 0) {
            console.log(`Removing ${currentThRoles.length} other TH roles from ${member.user.tag}`);
            await member.roles.remove(currentThRoles, 'Updating TH roles').catch(e => {
                console.error(`Failed to remove TH roles: ${e.message}`);
            });
        } else {
            console.log('No other TH roles to remove');
        }

        // Assign the current TH role
        console.log(`Adding role ${role.name} to ${member.user.tag}`);
        await member.roles.add(roleId, `TH${townHallLevel} role assignment`).catch(e => {
            console.error(`Failed to add TH role: ${e.message}`);
            throw e; // Re-throw to signal failure
        });

        console.log(`Successfully assigned TH${townHallLevel} role to ${member.user.tag}`);
    } catch (error) {
        console.error(`Error in assignTownHallRole for TH${townHallLevel}:`, error);
        throw error; // Re-throw to propagate error
    }
}

/**
 * Assign appropriate clan role
 */
async function assignClanRole(member, clanRole, clanRoleConfig) {
    try {
        console.log(`Starting clan role assignment for ${member.user.tag}, role="${clanRole}"`);

        // Map the CoC role to our config key
        const roleMap = {
            'leader': 'leader',
            'coLeader': 'coLeader',
            'co-leader': 'coLeader',
            'admin': 'coLeader', // Some versions use admin instead of coLeader
            'elder': 'elder',
            'member': 'member'
        };

        // Convert to lowercase for case-insensitive matching
        const lowerRole = (clanRole || '').toLowerCase();
        const roleKey = roleMap[lowerRole] || 'member';

        console.log(`Mapped role "${clanRole}" to config key "${roleKey}"`);

        // Verify role exists in config
        if (!clanRoleConfig[roleKey]) {
            console.log(`No role config found for "${roleKey}"`);
            return;
        }

        const roleId = clanRoleConfig[roleKey];
        if (!roleId) {
            console.log(`Role ID missing for "${roleKey}"`);
            return;
        }

        // Verify role exists in server
        const role = member.guild.roles.cache.get(roleId);
        if (!role) {
            console.log(`Role with ID ${roleId} not found in server for "${roleKey}"`);
            return;
        }

        console.log(`Found role ${role.name} (${role.id}) for "${roleKey}"`);

        // Check if already has the role
        if (member.roles.cache.has(roleId)) {
            console.log(`${member.user.tag} already has clan role ${role.name}`);
            return;
        }

        // Get all clan role IDs
        console.log('Getting list of all clan roles to remove');
        const allClanRoleIds = Object.values(clanRoleConfig).filter(id => id);
        console.log(`Found ${allClanRoleIds.length} total clan roles`);

        // Remove all other clan roles first
        const currentClanRoles = member.roles.cache
            .filter(role => allClanRoleIds.includes(role.id) && role.id !== roleId)
            .map(role => role.id);

        if (currentClanRoles.length > 0) {
            console.log(`Removing ${currentClanRoles.length} other clan roles from ${member.user.tag}`);
            await member.roles.remove(currentClanRoles, 'Updating clan roles').catch(e => {
                console.error(`Failed to remove clan roles: ${e.message}`);
            });
        } else {
            console.log('No other clan roles to remove');
        }

        // Assign the current clan role
        console.log(`Adding role ${role.name} to ${member.user.tag}`);
        await member.roles.add(roleId, `${roleKey} role assignment`).catch(e => {
            console.error(`Failed to add clan role: ${e.message}`);
            throw e; // Re-throw to signal failure
        });

        console.log(`Successfully assigned "${roleKey}" role to ${member.user.tag}`);
    } catch (error) {
        console.error(`Error in assignClanRole for "${clanRole}":`, error);
        throw error; // Re-throw to propagate error
    }
}

/**
 * Assign appropriate war activity role
 */
async function assignWarActivityRole(member, warStars, warActivityConfig) {
    try {
        console.log(`Starting war activity role assignment for ${member.user.tag}, ${warStars} stars`);

        // Get all war role IDs
        const allWarRoleIds = Object.keys(warActivityConfig).filter(id => id);

        if (allWarRoleIds.length === 0) {
            console.log('No war activity roles configured, skipping');
            return;
        }

        console.log(`Found ${allWarRoleIds.length} war activity roles`);

        // Find the highest tier role the player qualifies for
        let highestQualifyingRoleId = null;
        let highestStarRequirement = 0;

        for (const [roleId, config] of Object.entries(warActivityConfig)) {
            if (!roleId || !config) continue;

            const minStars = config.minStars || 0;
            console.log(`Checking war role ${roleId} - requires ${minStars} stars`);

            if (warStars >= minStars && minStars >= highestStarRequirement) {
                highestQualifyingRoleId = roleId;
                highestStarRequirement = minStars;
                console.log(`Player qualifies for role ${roleId} (${minStars} stars)`);
            }
        }

        // Handle case where player doesn't qualify for any role
        if (!highestQualifyingRoleId) {
            console.log(`${member.user.tag} does not qualify for any war activity role with ${warStars} stars`);

            // Remove all war roles
            const currentWarRoles = member.roles.cache
                .filter(role => allWarRoleIds.includes(role.id))
                .map(role => role.id);

            if (currentWarRoles.length > 0) {
                console.log(`Removing ${currentWarRoles.length} war roles from ${member.user.tag}`);
                await member.roles.remove(currentWarRoles, 'Does not qualify for any war role').catch(e => {
                    console.error(`Failed to remove war roles: ${e.message}`);
                });
            }

            return;
        }

        // Verify role exists
        const role = member.guild.roles.cache.get(highestQualifyingRoleId);
        if (!role) {
            console.log(`Role with ID ${highestQualifyingRoleId} not found in server`);
            return;
        }

        console.log(`Found role ${role.name} (${role.id}) for ${warStars} stars`);

        // Check if already has the role
        if (member.roles.cache.has(highestQualifyingRoleId)) {
            console.log(`${member.user.tag} already has war role ${role.name}`);
            return;
        }

        // Remove all other war roles first
        const currentWarRoles = member.roles.cache
            .filter(role => allWarRoleIds.includes(role.id) && role.id !== highestQualifyingRoleId)
            .map(role => role.id);

        if (currentWarRoles.length > 0) {
            console.log(`Removing ${currentWarRoles.length} other war roles from ${member.user.tag}`);
            await member.roles.remove(currentWarRoles, 'Updating war roles').catch(e => {
                console.error(`Failed to remove war roles: ${e.message}`);
            });
        } else {
            console.log('No other war roles to remove');
        }

        // Assign the highest qualifying role
        console.log(`Adding role ${role.name} to ${member.user.tag}`);
        await member.roles.add(highestQualifyingRoleId, `War activity role assignment (${warStars} stars)`).catch(e => {
            console.error(`Failed to add war role: ${e.message}`);
            throw e; // Re-throw to signal failure
        });

        console.log(`Successfully assigned war role to ${member.user.tag} for ${warStars} stars`);
    } catch (error) {
        console.error(`Error in assignWarActivityRole for ${warStars} stars:`, error);
        throw error; // Re-throw to propagate error
    }
}

/**
 * Assign appropriate donation tier role
 */
async function assignDonationRole(member, donations, donationConfig) {
    try {
        console.log(`Starting donation tier role assignment for ${member.user.tag}, ${donations} donations`);

        // Get all donation role IDs
        const allDonationRoleIds = Object.keys(donationConfig).filter(id => id);

        if (allDonationRoleIds.length === 0) {
            console.log('No donation tier roles configured, skipping');
            return;
        }

        console.log(`Found ${allDonationRoleIds.length} donation tier roles`);

        // Find the highest tier role the player qualifies for
        let highestQualifyingRoleId = null;
        let highestDonationRequirement = 0;

        for (const [roleId, config] of Object.entries(donationConfig)) {
            if (!roleId || !config) continue;

            const minDonations = config.minDonations || 0;
            console.log(`Checking donation role ${roleId} - requires ${minDonations} donations`);

            if (donations >= minDonations && minDonations >= highestDonationRequirement) {
                highestQualifyingRoleId = roleId;
                highestDonationRequirement = minDonations;
                console.log(`Player qualifies for role ${roleId} (${minDonations} donations)`);
            }
        }

        // Handle case where player doesn't qualify for any role
        if (!highestQualifyingRoleId) {
            console.log(`${member.user.tag} does not qualify for any donation tier role with ${donations} donations`);

            // Remove all donation roles
            const currentDonationRoles = member.roles.cache
                .filter(role => allDonationRoleIds.includes(role.id))
                .map(role => role.id);

            if (currentDonationRoles.length > 0) {
                console.log(`Removing ${currentDonationRoles.length} donation roles from ${member.user.tag}`);
                await member.roles.remove(currentDonationRoles, 'Does not qualify for any donation role').catch(e => {
                    console.error(`Failed to remove donation roles: ${e.message}`);
                });
            }

            return;
        }

        // Verify role exists
        const role = member.guild.roles.cache.get(highestQualifyingRoleId);
        if (!role) {
            console.log(`Role with ID ${highestQualifyingRoleId} not found in server`);
            return;
        }

        console.log(`Found role ${role.name} (${role.id}) for ${donations} donations`);

        // Check if already has the role
        if (member.roles.cache.has(highestQualifyingRoleId)) {
            console.log(`${member.user.tag} already has donation role ${role.name}`);
            return;
        }

        // Remove all other donation roles first
        const currentDonationRoles = member.roles.cache
            .filter(role => allDonationRoleIds.includes(role.id) && role.id !== highestQualifyingRoleId)
            .map(role => role.id);

        if (currentDonationRoles.length > 0) {
            console.log(`Removing ${currentDonationRoles.length} other donation roles from ${member.user.tag}`);
            await member.roles.remove(currentDonationRoles, 'Updating donation roles').catch(e => {
                console.error(`Failed to remove donation roles: ${e.message}`);
            });
        } else {
            console.log('No other donation roles to remove');
        }

        // Assign the highest qualifying role
        console.log(`Adding role ${role.name} to ${member.user.tag}`);
        await member.roles.add(highestQualifyingRoleId, `Donation role assignment (${donations} donations)`).catch(e => {
            console.error(`Failed to add donation role: ${e.message}`);
            throw e; // Re-throw to signal failure
        });

        console.log(`Successfully assigned donation role to ${member.user.tag} for ${donations} donations`);
    } catch (error) {
        console.error(`Error in assignDonationRole for ${donations} donations:`, error);
        throw error; // Re-throw to propagate error
    }
}

/**
 * Convert HSL to Hex color
 */
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}