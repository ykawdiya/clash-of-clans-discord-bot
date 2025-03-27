// src/commands/admin/roles.js
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
                return interaction.editReply('I do not have permission to manage roles in this server.');
            }

            const subcommand = interaction.options.getSubcommand();

            // Find linked clan for this Discord server
            const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });
            if (!linkedClan) {
                return interaction.editReply("This server doesn't have a linked clan. Use `/setclan` first.");
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

    // Create or find roles for each TH level
    for (let thLevel = 7; thLevel <= 15; thLevel++) {
        const roleName = `TH${thLevel}`;
        let role = interaction.guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            try {
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
            } catch (error) {
                console.error(`Failed to create role ${roleName}:`, error);
                return interaction.editReply(`Error creating role ${roleName}: ${error.message}`);
            }
        }

        // Store role ID with emoji
        thRoles[thLevel] = {
            id: role.id,
            emoji: thEmojis[thLevel] || `TH${thLevel}`
        };
    }

    // Save to database
    linkedClan.settings.roles.townHall = thRoles;
    await linkedClan.save();

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Town Hall Roles Setup Complete')
        .setDescription('I have set up the following Town Hall level roles:')
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

    // Add each role to the embed
    for (let thLevel = 7; thLevel <= 15; thLevel++) {
        const role = thRoles[thLevel];
        embed.addFields({
            name: `${role.emoji} Town Hall ${thLevel}`,
            value: `<@&${role.id}>`,
            inline: true
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Set up clan role roles (Member, Elder, Co-Leader, Leader)
 */
async function setupClanRoles(interaction, linkedClan) {
    // Define clan roles with their colors
    const clanRoleDefinitions = [
        { name: 'CoC Leader', color: '#e74c3c', clanRole: 'leader' },
        { name: 'CoC Co-Leader', color: '#e67e22', clanRole: 'coLeader' },
        { name: 'CoC Elder', color: '#f1c40f', clanRole: 'elder' },
        { name: 'CoC Member', color: '#3498db', clanRole: 'member' }
    ];

    const clanRoles = {};

    // Create or find roles
    for (const roleDef of clanRoleDefinitions) {
        let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

        if (!role) {
            try {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot clan role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } catch (error) {
                console.error(`Failed to create role ${roleDef.name}:`, error);
                return interaction.editReply(`Error creating role ${roleDef.name}: ${error.message}`);
            }
        }

        // Store role ID
        clanRoles[roleDef.clanRole] = role.id;
    }

    // Save to database
    linkedClan.settings.roles.clanRole = clanRoles;
    await linkedClan.save();

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Clan Roles Setup Complete')
        .setDescription('I have set up the following clan roles:')
        .addFields(
            { name: 'Leader', value: `<@&${clanRoles.leader}>`, inline: true },
            { name: 'Co-Leader', value: `<@&${clanRoles.coLeader}>`, inline: true },
            { name: 'Elder', value: `<@&${clanRoles.elder}>`, inline: true },
            { name: 'Member', value: `<@&${clanRoles.member}>`, inline: true }
        )
        .setFooter({ text: 'Use /roles sync to assign these roles to members' });

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

    // Create or find roles
    for (const roleDef of warRoleDefinitions) {
        let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

        if (!role) {
            try {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot war activity role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } catch (error) {
                console.error(`Failed to create role ${roleDef.name}:`, error);
                return interaction.editReply(`Error creating role ${roleDef.name}: ${error.message}`);
            }
        }

        // Store role ID with minimum stars
        warRoles[role.id] = { minStars: roleDef.minStars };
    }

    // Save to database
    linkedClan.settings.roles.warActivity = warRoles;
    await linkedClan.save();

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('War Activity Roles Setup Complete')
        .setDescription('I have set up the following war activity roles:');

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

    embed.setFooter({ text: 'Use /roles sync to assign these roles to members' });

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

    // Create or find roles
    for (const roleDef of donationRoleDefinitions) {
        let role = interaction.guild.roles.cache.find(r => r.name === roleDef.name);

        if (!role) {
            try {
                role = await interaction.guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    reason: 'Clash of Clans bot donation tier role setup',
                    mentionable: false
                });

                console.log(`Created role ${roleDef.name}`);
            } catch (error) {
                console.error(`Failed to create role ${roleDef.name}:`, error);
                return interaction.editReply(`Error creating role ${roleDef.name}: ${error.message}`);
            }
        }

        // Store role ID with minimum donations
        donationRoles[role.id] = { minDonations: roleDef.minDonations };
    }

    // Save to database
    linkedClan.settings.roles.donationTier = donationRoles;
    await linkedClan.save();

    // Create a response embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Donation Tier Roles Setup Complete')
        .setDescription('I have set up the following donation tier roles:');

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

    embed.setFooter({ text: 'Use /roles sync to assign these roles to members' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Sync roles for all linked members
 */
async function syncRoles(interaction, linkedClan) {
    // Check if role settings exist
    if (!linkedClan.settings.roles) {
        return interaction.editReply('No role configuration found. Use `/roles setup` first.');
    }

    // Get all linked users
    const linkedUsers = await User.find({ discordId: { $exists: true } });
    if (linkedUsers.length === 0) {
        return interaction.editReply('No linked users found. Members need to use `/link` to connect their accounts.');
    }

    // Create a progress embed
    await interaction.editReply('Starting role synchronization...');

    // Track results
    const results = {
        success: 0,
        failed: 0,
        notInServer: 0,
        notInClan: 0
    };

    // Get clan data
    const clanData = await clashApiService.getClan(linkedClan.clanTag);

    // Process each linked user
    for (const user of linkedUsers) {
        if (!user.playerTag) continue;

        try {
            // Get member from the guild
            const member = await interaction.guild.members.fetch(user.discordId).catch(() => null);

            if (!member) {
                results.notInServer++;
                continue;
            }

            // Get player data
            const playerData = await clashApiService.getPlayer(user.playerTag);

            // Check if player is in the linked clan
            const isInClan = playerData.clan && playerData.clan.tag === linkedClan.clanTag;

            // Find the player in the clan members list to get donations
            let clanMemberData = null;
            if (isInClan && clanData.memberList) {
                clanMemberData = clanData.memberList.find(m => m.tag === playerData.tag);
            }

            if (!isInClan) {
                results.notInClan++;
                // Remove clan-related roles if configured
                await removeAllClanRoles(member, linkedClan.settings.roles);
                continue;
            }

            // Assign roles based on configurations
            await assignAllRoles(member, playerData, clanMemberData, linkedClan.settings.roles);

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
            { name: 'Not in Clan', value: results.notInClan.toString(), inline: true }
        );

    return interaction.editReply({ content: null, embeds: [embed] });
}

/**
 * Show current role configuration
 */
async function showRoleConfig(interaction, linkedClan) {
    // Check if role settings exist
    if (!linkedClan.settings.roles) {
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
            const role = interaction.guild.roles.cache.get(config.id);
            if (role) {
                thRolesText += `TH${level}: ${role.name} <@&${role.id}>\n`;
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
            const discordRole = interaction.guild.roles.cache.get(id);
            if (discordRole) {
                clanRolesText += `${role.charAt(0).toUpperCase() + role.slice(1)}: ${discordRole.name} <@&${discordRole.id}>\n`;
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
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                warRolesText += `${role.name}: ${config.minStars}+ war stars\n`;
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
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                donationRolesText += `${role.name}: ${config.minDonations}+ donations\n`;
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
    // Handle TH level roles
    if (roleConfig.townHall) {
        await assignTownHallRole(member, playerData.townHallLevel, roleConfig.townHall);
    }

    // Handle clan roles
    if (roleConfig.clanRole) {
        await assignClanRole(member, playerData.role || 'member', roleConfig.clanRole);
    }

    // Handle war activity roles
    if (roleConfig.warActivity) {
        await assignWarActivityRole(member, playerData.warStars || 0, roleConfig.warActivity);
    }

    // Handle donation tier roles
    if (roleConfig.donationTier && clanMemberData) {
        await assignDonationRole(member, clanMemberData.donations || 0, roleConfig.donationTier);
    }
}

/**
 * Remove all clan-related roles when a player is no longer in the clan
 */
async function removeAllClanRoles(member, roleConfig) {
    // Get all role IDs to remove
    const rolesToRemove = new Set();

    // Add town hall roles
    if (roleConfig.townHall) {
        Object.values(roleConfig.townHall).forEach(config => rolesToRemove.add(config.id));
    }

    // Add clan roles
    if (roleConfig.clanRole) {
        Object.values(roleConfig.clanRole).forEach(roleId => rolesToRemove.add(roleId));
    }

    // Add war activity roles
    if (roleConfig.warActivity) {
        Object.keys(roleConfig.warActivity).forEach(roleId => rolesToRemove.add(roleId));
    }

    // Add donation tier roles
    if (roleConfig.donationTier) {
        Object.keys(roleConfig.donationTier).forEach(roleId => rolesToRemove.add(roleId));
    }

    // Remove roles that the member has
    const rolesToActuallyRemove = member.roles.cache
        .filter(role => rolesToRemove.has(role.id))
        .map(role => role.id);

    if (rolesToActuallyRemove.length > 0) {
        await member.roles.remove(rolesToActuallyRemove);
    }
}

/**
 * Assign appropriate town hall role
 */
async function assignTownHallRole(member, townHallLevel, thRoleConfig) {
    // Get all TH role IDs
    const allThRoleIds = Object.values(thRoleConfig).map(config => config.id);

    // Remove all TH roles first
    const currentThRoles = member.roles.cache
        .filter(role => allThRoleIds.includes(role.id))
        .map(role => role.id);

    if (currentThRoles.length > 0) {
        await member.roles.remove(currentThRoles);
    }

    // Assign the current TH role if it exists in our config
    if (thRoleConfig[townHallLevel]) {
        await member.roles.add(thRoleConfig[townHallLevel].id);
    }
}

/**
 * Assign appropriate clan role
 */
async function assignClanRole(member, clanRole, clanRoleConfig) {
    // Map the CoC role to our config key
    const roleMap = {
        leader: 'leader',
        coLeader: 'coLeader',
        admin: 'coLeader', // Some versions use admin instead of coLeader
        elder: 'elder',
        member: 'member'
    };

    const roleKey = roleMap[clanRole.toLowerCase()] || 'member';

    // Get all clan role IDs
    const allClanRoleIds = Object.values(clanRoleConfig);

    // Remove all clan roles first
    const currentClanRoles = member.roles.cache
        .filter(role => allClanRoleIds.includes(role.id))
        .map(role => role.id);

    if (currentClanRoles.length > 0) {
        await member.roles.remove(currentClanRoles);
    }

    // Assign the current clan role
    if (clanRoleConfig[roleKey]) {
        await member.roles.add(clanRoleConfig[roleKey]);
    }
}

/**
 * Assign appropriate war activity role
 */
async function assignWarActivityRole(member, warStars, warActivityConfig) {
    // Get all war role IDs
    const allWarRoleIds = Object.keys(warActivityConfig);

    // Remove all war roles first
    const currentWarRoles = member.roles.cache
        .filter(role => allWarRoleIds.includes(role.id))
        .map(role => role.id);

    if (currentWarRoles.length > 0) {
        await member.roles.remove(currentWarRoles);
    }

    // Find the highest tier role the player qualifies for
    let highestQualifyingRoleId = null;
    let highestStarRequirement = 0;

    for (const [roleId, config] of Object.entries(warActivityConfig)) {
        if (warStars >= config.minStars && config.minStars >= highestStarRequirement) {
            highestQualifyingRoleId = roleId;
            highestStarRequirement = config.minStars;
        }
    }

    // Assign the highest qualifying role
    if (highestQualifyingRoleId) {
        await member.roles.add(highestQualifyingRoleId);
    }
}

/**
 * Assign appropriate donation tier role
 */
async function assignDonationRole(member, donations, donationConfig) {
    // Get all donation role IDs
    const allDonationRoleIds = Object.keys(donationConfig);

    // Remove all donation roles first
    const currentDonationRoles = member.roles.cache
        .filter(role => allDonationRoleIds.includes(role.id))
        .map(role => role.id);

    if (currentDonationRoles.length > 0) {
        await member.roles.remove(currentDonationRoles);
    }

    // Find the highest tier role the player qualifies for
    let highestQualifyingRoleId = null;
    let highestDonationRequirement = 0;

    for (const [roleId, config] of Object.entries(donationConfig)) {
        if (donations >= config.minDonations && config.minDonations >= highestDonationRequirement) {
            highestQualifyingRoleId = roleId;
            highestDonationRequirement = config.minDonations;
        }
    }

    // Assign the highest qualifying role
    if (highestQualifyingRoleId) {
        await member.roles.add(highestQualifyingRoleId);
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