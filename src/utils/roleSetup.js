// src/utils/roleSetup.js
const { PermissionFlagsBits } = require('discord.js');
const configManager = require('./configManager');
const User = require('../models/User');

/**
 * Create roles based on the selected types
 * @param {Guild} guild Discord guild
 * @param {Array} roleTypes Types of roles to create (clan_roles, th_roles, etc.)
 * @returns {Promise<Array>} Array of created roles
 */
async function createRoles(guild, roleTypes) {
    const createdRoles = [];

    // Add delay to avoid rate limits
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Check existing roles to avoid duplicates
    const existingRoles = guild.roles.cache;

    // Create Clan Roles
    if (roleTypes.includes('clan_roles')) {
        const clanRoles = [
            { name: 'Leader', color: '#e74c3c', permissions: ['Administrator'] },
            { name: 'Co-Leader', color: '#e67e22', permissions: ['ManageChannels', 'ManageRoles', 'KickMembers'] },
            { name: 'Elder', color: '#f1c40f', permissions: ['ManageMessages'] },
            { name: 'Member', color: '#3498db', permissions: [] }
        ];

        for (const roleData of clanRoles) {
            // Check if role already exists
            const existingRole = existingRoles.find(r =>
                r.name.toLowerCase() === roleData.name.toLowerCase() ||
                r.name.toLowerCase() === `coc ${roleData.name.toLowerCase()}`
            );

            if (existingRole) {
                createdRoles.push({
                    id: existingRole.id,
                    name: existingRole.name,
                    type: 'clan_role'
                });
                continue;
            }

            try {
                // Convert permission names to bitmask
                const permissionBits = new PermissionFlagsBits();
                roleData.permissions.forEach(perm => {
                    if (PermissionFlagsBits[perm]) {
                        permissionBits.add(PermissionFlagsBits[perm]);
                    }
                });

                // Create the role
                const role = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    permissions: permissionBits,
                    reason: 'Server setup wizard - clan roles'
                });

                createdRoles.push({
                    id: role.id,
                    name: role.name,
                    type: 'clan_role'
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating role ${roleData.name}:`, error);
            }
        }
    }

    // Create Town Hall Roles
    if (roleTypes.includes('th_roles')) {
        // Create roles for TH7-TH15
        const thColors = {
            // Colors get increasingly vibrant for higher TH levels
            7: '#95a5a6',  // Grey
            8: '#7f8c8d',  // Darker grey
            9: '#16a085',  // Teal
            10: '#2980b9', // Blue
            11: '#8e44ad', // Purple
            12: '#c0392b', // Red
            13: '#000000', // Black
            14: '#f39c12', // Orange
            15: '#f1c40f'  // Yellow/Gold
        };

        for (let th = 7; th <= 15; th++) {
            const roleName = `TH${th}`;

            // Check if role already exists
            const existingRole = existingRoles.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase()
            );

            if (existingRole) {
                createdRoles.push({
                    id: existingRole.id,
                    name: existingRole.name,
                    type: 'th_role',
                    level: th
                });
                continue;
            }

            try {
                // Create the role
                const role = await guild.roles.create({
                    name: roleName,
                    color: thColors[th],
                    reason: 'Server setup wizard - TH roles'
                });

                createdRoles.push({
                    id: role.id,
                    name: role.name,
                    type: 'th_role',
                    level: th
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating role ${roleName}:`, error);
            }
        }
    }

    // Create War Roles
    if (roleTypes.includes('war_roles')) {
        const warRoles = [
            { name: 'War General', color: '#c0392b', permissions: [] },
            { name: 'War Team', color: '#e67e22', permissions: [] },
            { name: 'CWL Player', color: '#9b59b6', permissions: [] }
        ];

        for (const roleData of warRoles) {
            // Check if role already exists
            const existingRole = existingRoles.find(r =>
                r.name.toLowerCase() === roleData.name.toLowerCase()
            );

            if (existingRole) {
                createdRoles.push({
                    id: existingRole.id,
                    name: existingRole.name,
                    type: 'war_role'
                });
                continue;
            }

            try {
                // Create the role
                const role = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    reason: 'Server setup wizard - war roles'
                });

                createdRoles.push({
                    id: role.id,
                    name: role.name,
                    type: 'war_role'
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating role ${roleData.name}:`, error);
            }
        }
    }

    // Create Special Roles
    if (roleTypes.includes('special_roles')) {
        const specialRoles = [
            { name: 'Bot Admin', color: '#1abc9c', permissions: [] },
            { name: 'Event Manager', color: '#3498db', permissions: [] },
            { name: 'Recruiter', color: '#2ecc71', permissions: [] }
        ];

        for (const roleData of specialRoles) {
            // Check if role already exists
            const existingRole = existingRoles.find(r =>
                r.name.toLowerCase() === roleData.name.toLowerCase()
            );

            if (existingRole) {
                createdRoles.push({
                    id: existingRole.id,
                    name: existingRole.name,
                    type: 'special_role'
                });
                continue;
            }

            try {
                // Create the role
                const role = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    reason: 'Server setup wizard - special roles'
                });

                createdRoles.push({
                    id: role.id,
                    name: role.name,
                    type: 'special_role'
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating role ${roleData.name}:`, error);
            }
        }
    }

    return createdRoles;
}

/**
 * Get all roles created by type
 * @param {Guild} guild Discord guild
 * @param {String} type Role type to search for
 * @returns {Object} Map of role names to role IDs
 */
function getRolesByType(guild, type) {
    const roles = {};

    if (type === 'clan_roles') {
        // Look for clan roles: Leader, Co-Leader, Elder, Member
        const clanRoleNames = ['leader', 'co-leader', 'elder', 'member'];

        for (const [_, role] of guild.roles.cache) {
            const roleName = role.name.toLowerCase();

            // Check if this is a clan role
            for (const clanRole of clanRoleNames) {
                if (roleName === clanRole || roleName === `coc ${clanRole}`) {
                    roles[clanRole] = role.id;
                    break;
                }
            }
        }
    } else if (type === 'th_roles') {
        // Look for TH roles: TH7-TH15
        for (let th = 7; th <= 15; th++) {
            const roleName = `th${th}`;
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName ||
                r.name.toLowerCase() === `${roleName}`
            );

            if (role) {
                roles[roleName] = role.id;
            }
        }
    }

    return roles;
}

/**
 * Synchronize roles with clan data
 * @param {Guild} guild Discord guild
 * @param {Object} clanData Clan data from the API
 * @returns {Promise<Object>} Results of the sync operation
 */
async function syncRolesWithClan(guild, clanData) {
    // First get all the roles by type
    const clanRoles = getRolesByType(guild, 'clan_roles');
    const thRoles = getRolesByType(guild, 'th_roles');

    // Statistics for tracking sync results
    const results = {
        members: 0,
        roles: 0,
        errors: 0
    };

    // If no members in clan data, return
    if (!clanData.memberList || clanData.memberList.length === 0) {
        return results;
    }

    // Find all linked users
    const linkedUsers = await User.find({});

    // Create a map of player tags to Discord IDs
    const playerMap = {};
    linkedUsers.forEach(user => {
        if (user.playerTag) {
            playerMap[user.playerTag] = user.discordId;
        }
    });

    // Process each clan member
    for (const member of clanData.memberList) {
        // Skip if no player tag
        if (!member.tag) continue;

        // Find Discord ID for this player
        const discordId = playerMap[member.tag];
        if (!discordId) continue;

        // Try to find the Discord member
        let guildMember;
        try {
            guildMember = await guild.members.fetch(discordId);
        } catch (error) {
            console.error(`Member not found for Discord ID ${discordId}:`, error);
            results.errors++;
            continue;
        }

        // Assign clan role
        try {
            let roleKey = member.role.toLowerCase();
            // Handle the "admin" role which is the same as "co-leader" in discord
            if (roleKey === 'admin') roleKey = 'co-leader';

            if (clanRoles[roleKey]) {
                await guildMember.roles.add(clanRoles[roleKey]);
                results.roles++;
            }
        } catch (error) {
            console.error(`Error assigning clan role to ${member.name}:`, error);
            results.errors++;
        }

        // Assign TH role
        try {
            const thKey = `th${member.townhallLevel}`;

            if (thRoles[thKey]) {
                await guildMember.roles.add(thRoles[thKey]);
                results.roles++;
            }
        } catch (error) {
            console.error(`Error assigning TH role to ${member.name}:`, error);
            results.errors++;
        }

        // Successfully processed a member
        results.members++;
    }

    return results;
}

module.exports = {
    createRoles,
    getRolesByType,
    syncRolesWithClan
};