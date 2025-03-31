// src/services/roleSyncService.js
const Clan = require('../models/Clan');
const User = require('../models/User');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

// Schema update can be done directly in the Clan.js file
// For simplicity, we'll define a separate schema for role sync settings
const mongoose = require('mongoose');
let RoleSyncSettings;

try {
    RoleSyncSettings = mongoose.model('RoleSyncSettings');
} catch (e) {
    // Define the schema if it doesn't exist
    const roleSyncSchema = new mongoose.Schema({
        guildId: {
            type: String,
            required: true,
            index: true
        },
        enabled: {
            type: Boolean,
            default: false
        },
        frequency: {
            type: Number,
            default: 6 // Hours
        },
        lastSync: Date,
        lastSyncFailed: {
            type: Boolean,
            default: false
        },
        roleMapping: {
            leader: String,
            coLeader: String,
            elder: String,
            member: String
        },
        clanRoles: [{
            clanTag: String,
            roleId: String
        }],
        townHallRoles: {
            type: Map,
            of: String
        }
    });

    RoleSyncSettings = mongoose.model('RoleSyncSettings', roleSyncSchema);
}

class RoleSyncService {
    constructor() {
        this.syncInterval = null;
        this.syncGuilds = new Map();
    }

    /**
     * Set role mappings for a clan
     * @param {String} guildId - Discord guild ID
     * @param {String} clanTag - Clan tag
     * @param {Object} roleMappings - Role mappings
     * @returns {Object} Updated settings
     */
    async setRoleMappings(guildId, clanTag, roleMappings) {
        try {
            // Validate clan exists
            const clan = await Clan.findOne({ clanTag });
            if (!clan) {
                throw new Error('Clan not found');
            }

            // Get or create settings
            let settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                settings = new RoleSyncSettings({
                    guildId,
                    roleMapping: roleMappings,
                    clanRoles: [],
                    townHallRoles: new Map()
                });
            } else {
                settings.roleMapping = {
                    ...settings.roleMapping,
                    ...roleMappings
                };
            }

            await settings.save();
            log.info(`Role mappings set for guild ${guildId}, clan ${clanTag}`, {
                guildId,
                clanTag,
                roleMappings
            });

            return settings;
        } catch (error) {
            log.error('Error setting role mappings', {
                error: error.message,
                guildId,
                clanTag
            });
            throw error;
        }
    }

    /**
     * Set a clan-specific role
     * @param {String} guildId - Discord guild ID
     * @param {String} clanTag - Clan tag
     * @param {String} roleId - Discord role ID
     * @returns {Object} Updated settings
     */
    async setClanRole(guildId, clanTag, roleId) {
        try {
            // Validate clan exists
            const clan = await Clan.findOne({ clanTag });
            if (!clan) {
                throw new Error('Clan not found');
            }

            // Get or create settings
            let settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                settings = new RoleSyncSettings({
                    guildId,
                    clanRoles: [{
                        clanTag,
                        roleId
                    }]
                });
            } else {
                // Check if clan role already exists
                const existingIndex = settings.clanRoles.findIndex(cr => cr.clanTag === clanTag);
                if (existingIndex >= 0) {
                    settings.clanRoles[existingIndex].roleId = roleId;
                } else {
                    settings.clanRoles.push({
                        clanTag,
                        roleId
                    });
                }
            }

            await settings.save();
            log.info(`Clan role set for guild ${guildId}, clan ${clanTag}`, {
                guildId,
                clanTag,
                roleId
            });

            return settings;
        } catch (error) {
            log.error('Error setting clan role', {
                error: error.message,
                guildId,
                clanTag
            });
            throw error;
        }
    }

    /**
     * Set a Town Hall level role
     * @param {String} guildId - Discord guild ID
     * @param {Number} level - Town Hall level
     * @param {String} roleId - Discord role ID
     * @returns {Object} Updated settings
     */
    async setTownHallRole(guildId, level, roleId) {
        try {
            // Validate level
            if (level < 1 || level > 15) {
                throw new Error('Invalid Town Hall level');
            }

            // Get or create settings
            let settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                const townHallRoles = new Map();
                townHallRoles.set(level.toString(), roleId);

                settings = new RoleSyncSettings({
                    guildId,
                    townHallRoles
                });
            } else {
                if (!settings.townHallRoles) {
                    settings.townHallRoles = new Map();
                }

                settings.townHallRoles.set(level.toString(), roleId);
            }

            await settings.save();
            log.info(`Town Hall role set for guild ${guildId}, level ${level}`, {
                guildId,
                level,
                roleId
            });

            return settings;
        } catch (error) {
            log.error('Error setting Town Hall role', {
                error: error.message,
                guildId,
                level
            });
            throw error;
        }
    }

    /**
     * Enable role synchronization
     * @param {String} guildId - Discord guild ID
     * @param {Number} frequency - Sync frequency in hours
     * @returns {Object} Updated settings
     */
    async enableRoleSync(guildId, frequency = 6) {
        try {
            // Get or create settings
            let settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                settings = new RoleSyncSettings({
                    guildId,
                    enabled: true,
                    frequency
                });
            } else {
                settings.enabled = true;
                settings.frequency = frequency;
            }

            await settings.save();
            log.info(`Role sync enabled for guild ${guildId}`, {
                guildId,
                frequency
            });

            // Set up sync interval if not already running
            this.setupSyncInterval(guildId, frequency);

            return settings;
        } catch (error) {
            log.error('Error enabling role sync', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }

    /**
     * Disable role synchronization
     * @param {String} guildId - Discord guild ID
     * @returns {Object} Updated settings
     */
    async disableRoleSync(guildId) {
        try {
            // Get or create settings
            let settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                settings = new RoleSyncSettings({
                    guildId,
                    enabled: false
                });
            } else {
                settings.enabled = false;
            }

            await settings.save();
            log.info(`Role sync disabled for guild ${guildId}`, {
                guildId
            });

            // Clear sync interval
            this.clearSyncInterval(guildId);

            return settings;
        } catch (error) {
            log.error('Error disabling role sync', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }

    /**
     * Set up sync interval for a guild
     * @param {String} guildId - Discord guild ID
     * @param {Number} frequency - Sync frequency in hours
     */
    setupSyncInterval(guildId, frequency) {
        // Clear existing interval
        this.clearSyncInterval(guildId);

        // Convert hours to milliseconds
        const intervalMs = frequency * 60 * 60 * 1000;

        // Set up new interval
        const interval = setInterval(() => {
            this.syncRoles(guildId).catch(error => {
                log.error('Error in scheduled role sync', {
                    error: error.message,
                    guildId
                });
            });
        }, intervalMs);

        // Store interval reference
        this.syncGuilds.set(guildId, interval);

        log.info(`Role sync interval set up for guild ${guildId}`, {
            guildId,
            frequency
        });
    }

    /**
     * Clear sync interval for a guild
     * @param {String} guildId - Discord guild ID
     */
    clearSyncInterval(guildId) {
        if (this.syncGuilds.has(guildId)) {
            clearInterval(this.syncGuilds.get(guildId));
            this.syncGuilds.delete(guildId);

            log.info(`Role sync interval cleared for guild ${guildId}`, {
                guildId
            });
        }
    }

    /**
     * Synchronize roles for a guild
     * @param {String} guildId - Discord guild ID
     * @returns {Object} Sync results
     */
    async syncRoles(guildId) {
        const startTime = Date.now();
        const syncResults = {
            totalUsers: 0,
            updatedUsers: 0,
            skippedUsers: 0,
            failedUsers: 0,
            details: '',
            executionTime: 0
        };

        try {
            log.info(`Starting role sync for guild ${guildId}`);

            // Get settings
            const settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                throw new Error('Role sync settings not found');
            }

            // Update last sync time
            settings.lastSync = new Date();

            // Get guild
            const client = global.client;
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                throw new Error('Guild not found');
            }

            // Fetch all linked users
            const linkedUsers = await User.find({ discordId: { $exists: true, $ne: null } });

            // Get all clans for this guild
            const clans = await Clan.find({ guildId });
            if (!clans || clans.length === 0) {
                throw new Error('No clans found for this guild');
            }

            // Fetch member data for each clan
            const clansWithMembers = await Promise.all(
                clans.map(async (clan) => {
                    try {
                        const clanData = await clashApiService.getClan(clan.clanTag);
                        return {
                            ...clan.toObject(),
                            members: clanData.memberList || []
                        };
                    } catch (error) {
                        log.error(`Error fetching clan data for ${clan.clanTag}`, {
                            error: error.message,
                            clan: clan.clanTag
                        });
                        return {
                            ...clan.toObject(),
                            members: []
                        };
                    }
                })
            );

            // Process each linked user
            for (const user of linkedUsers) {
                syncResults.totalUsers++;

                try {
                    // Get Discord member
                    let member;
                    try {
                        member = await guild.members.fetch(user.discordId);
                    } catch (error) {
                        // User might not be in this guild
                        syncResults.skippedUsers++;
                        continue;
                    }

                    // Find clan membership
                    let foundMembership = false;
                    let playerData = null;
                    let clanData = null;

                    for (const clan of clansWithMembers) {
                        const clanMember = clan.members.find(m => m.tag === user.playerTag);
                        if (clanMember) {
                            foundMembership = true;
                            playerData = clanMember;
                            clanData = clan;
                            break;
                        }
                    }

                    // If user is not in any clan, skip
                    if (!foundMembership) {
                        syncResults.skippedUsers++;
                        continue;
                    }

                    // Get roles to assign
                    const rolesToAssign = [];
                    const rolesToRemove = [];

                    // Add position-based role
                    if (settings.roleMapping) {
                        const roleKey = this.convertCocRoleToKey(playerData.role);
                        const roleId = settings.roleMapping[roleKey];

                        if (roleId) {
                            rolesToAssign.push(roleId);

                            // Remove other position roles
                            for (const [key, id] of Object.entries(settings.roleMapping)) {
                                if (key !== roleKey && id) {
                                    rolesToRemove.push(id);
                                }
                            }
                        }
                    }

                    // Add clan-specific role
                    if (settings.clanRoles && settings.clanRoles.length > 0) {
                        const clanRole = settings.clanRoles.find(cr => cr.clanTag === clanData.clanTag);
                        if (clanRole) {
                            rolesToAssign.push(clanRole.roleId);

                            // Remove other clan roles
                            for (const cr of settings.clanRoles) {
                                if (cr.clanTag !== clanData.clanTag) {
                                    rolesToRemove.push(cr.roleId);
                                }
                            }
                        }
                    }

                    // Add Town Hall role if available
                    if (settings.townHallRoles && playerData.townhallLevel) {
                        const thRoleId = settings.townHallRoles.get(playerData.townhallLevel.toString());
                        if (thRoleId) {
                            rolesToAssign.push(thRoleId);

                            // Remove other TH roles
                            for (const [level, id] of settings.townHallRoles.entries()) {
                                if (level !== playerData.townhallLevel.toString()) {
                                    rolesToRemove.push(id);
                                }
                            }
                        }
                    }

                    // Update roles
                    const rolesToAdd = rolesToAssign.filter(roleId => !member.roles.cache.has(roleId));
                    const rolesToRemoveFiltered = rolesToRemove.filter(roleId => member.roles.cache.has(roleId));

                    if (rolesToAdd.length > 0 || rolesToRemoveFiltered.length > 0) {
                        // Add roles
                        for (const roleId of rolesToAdd) {
                            try {
                                const role = await guild.roles.fetch(roleId);
                                if (role) {
                                    await member.roles.add(role);
                                }
                            } catch (error) {
                                log.error(`Error adding role ${roleId} to user ${user.discordId}`, {
                                    error: error.message,
                                    user: user.discordId,
                                    role: roleId
                                });
                            }
                        }

                        // Remove roles
                        for (const roleId of rolesToRemoveFiltered) {
                            try {
                                const role = await guild.roles.fetch(roleId);
                                if (role) {
                                    await member.roles.remove(role);
                                }
                            } catch (error) {
                                log.error(`Error removing role ${roleId} from user ${user.discordId}`, {
                                    error: error.message,
                                    user: user.discordId,
                                    role: roleId
                                });
                            }
                        }

                        syncResults.updatedUsers++;
                    } else {
                        syncResults.skippedUsers++;
                    }
                } catch (error) {
                    log.error(`Error processing user ${user.discordId}`, {
                        error: error.message,
                        user: user.discordId
                    });

                    syncResults.failedUsers++;
                }
            }

            // Update sync status
            settings.lastSyncFailed = false;
            await settings.save();

            // Calculate execution time
            syncResults.executionTime = Date.now() - startTime;

            // Generate details
            syncResults.details = `Processed ${syncResults.totalUsers} users:\n` +
                `• Updated roles for ${syncResults.updatedUsers} users\n` +
                `• Skipped ${syncResults.skippedUsers} users (no changes needed or not in guild)\n` +
                `• Failed to update ${syncResults.failedUsers} users`;

            log.info(`Role sync completed for guild ${guildId}`, {
                guildId,
                results: syncResults
            });

            return syncResults;
        } catch (error) {
            log.error('Error synchronizing roles', {
                error: error.message,
                guildId
            });

            // Update sync status
            const settings = await RoleSyncSettings.findOne({ guildId });
            if (settings) {
                settings.lastSyncFailed = true;
                await settings.save();
            }

            // Calculate execution time
            syncResults.executionTime = Date.now() - startTime;
            syncResults.details = `Error: ${error.message}`;

            throw error;
        }
    }

    /**
     * Convert CoC role to key for role mapping
     * @param {String} cocRole - CoC role
     * @returns {String} Role key
     */
    convertCocRoleToKey(cocRole) {
        if (!cocRole) return 'member';

        const role = cocRole.toLowerCase();
        if (role === 'leader') return 'leader';
        if (role === 'coleader' || role === 'co-leader' || role === 'admin') return 'coLeader';
        if (role === 'elder') return 'elder';
        return 'member';
    }

    /**
     * Get role sync status
     * @param {String} guildId - Discord guild ID
     * @returns {Object} Role sync status
     */
    async getRoleSyncStatus(guildId) {
        try {
            // Get settings
            const settings = await RoleSyncSettings.findOne({ guildId });
            if (!settings) {
                return {
                    enabled: false,
                    clansWithRoles: 0,
                    townHallRoles: false
                };
            }

            // Get clan role names
            const clanRoles = [];
            if (settings.clanRoles && settings.clanRoles.length > 0) {
                for (const clanRole of settings.clanRoles) {
                    try {
                        const clan = await Clan.findOne({ clanTag: clanRole.clanTag });
                        if (clan) {
                            clanRoles.push({
                                clanTag: clanRole.clanTag,
                                clanName: clan.name,
                                roleId: clanRole.roleId
                            });
                        }
                    } catch (error) {
                        log.error(`Error getting clan info for ${clanRole.clanTag}`, {
                            error: error.message,
                            clanTag: clanRole.clanTag
                        });
                    }
                }
            }

            return {
                enabled: settings.enabled,
                frequency: settings.frequency,
                lastSync: settings.lastSync,
                lastSyncFailed: settings.lastSyncFailed,
                clansWithRoles: clanRoles.length,
                townHallRoles: settings.townHallRoles && settings.townHallRoles.size > 0,
                roleNames: settings.roleMapping,
                clanRoles
            };
        } catch (error) {
            log.error('Error getting role sync status', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }

    /**
     * Initialize role sync for all guilds on startup
     */
    async initializeRoleSync() {
        try {
            log.info('Initializing role sync for all guilds');

            // Get all settings
            const allSettings = await RoleSyncSettings.find({ enabled: true });

            // Set up intervals for each guild
            for (const settings of allSettings) {
                this.setupSyncInterval(settings.guildId, settings.frequency);
            }

            log.info(`Role sync initialized for ${allSettings.length} guilds`);
        } catch (error) {
            log.error('Error initializing role sync', {
                error: error.message
            });
        }
    }
}

const roleSyncService = new RoleSyncService();

// Initialize on startup
setTimeout(() => {
    roleSyncService.initializeRoleSync().catch(error => {
        log.error('Error during role sync initialization', {
            error: error.message
        });
    });
}, 5000); // Wait for bot to fully start

module.exports = roleSyncService;