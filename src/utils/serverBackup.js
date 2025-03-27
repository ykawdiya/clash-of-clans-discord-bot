// src/utils/serverBackup.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs').promises;

/**
 * Creates a backup of server structure and permissions
 * @param {Guild} guild Discord guild
 * @returns {Promise<Object>} Backup data
 */
async function createBackup(guild) {
    try {
        console.log(`Creating backup for server: ${guild.name} (${guild.id})`);

        // Create backup object
        const backup = {
            timestamp: Date.now(),
            guildId: guild.id,
            guildName: guild.name,
            channels: [],
            roles: [],
            permissions: []
        };

        // Backup channels
        for (const [id, channel] of guild.channels.cache) {
            const channelData = {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId || null,
                position: channel.position
            };

            // Add permission overwrites
            if (channel.permissionOverwrites) {
                channelData.permissionOverwrites = [];

                for (const [id, overwrite] of channel.permissionOverwrites.cache) {
                    channelData.permissionOverwrites.push({
                        id: id,
                        type: overwrite.type,
                        allow: overwrite.allow.bitfield.toString(),
                        deny: overwrite.deny.bitfield.toString()
                    });
                }
            }

            backup.channels.push(channelData);
        }

        // Backup roles
        for (const [id, role] of guild.roles.cache) {
            // Skip @everyone role
            if (role.id === guild.id) continue;

            backup.roles.push({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                position: role.position,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable
            });
        }

        // Store backup
        await saveBackup(guild.id, backup);

        console.log(`Backup created successfully for ${guild.name}`);
        return backup;
    } catch (error) {
        console.error('Error creating server backup:', error);
        throw error;
    }
}

/**
 * Restore server from backup
 * @param {Guild} guild Discord guild
 * @param {Object|string} backup Backup data or backup ID
 * @returns {Promise<Object>} Restoration results
 */
async function restoreFromBackup(guild, backup) {
    try {
        console.log(`Restoring backup for server: ${guild.name} (${guild.id})`);

        // If string provided, load backup by ID
        if (typeof backup === 'string') {
            backup = await loadBackup(guild.id, backup);
        }

        // Check if backup is from this guild
        if (backup.guildId !== guild.id) {
            throw new Error('Backup is from a different server');
        }

        const results = {
            rolesRestored: 0,
            channelsRestored: 0,
            errors: []
        };

        // Helper function for safe async operations
        const safeAsync = async (fn, errorMessage) => {
            try {
                return await fn();
            } catch (error) {
                console.error(errorMessage, error);
                results.errors.push({
                    message: errorMessage,
                    error: error.message
                });
                return null;
            }
        };

        // Map of old role IDs to new role IDs
        const roleMap = new Map();

        // Restore roles (highest position first to maintain hierarchy)
        const sortedRoles = [...backup.roles].sort((a, b) => b.position - a.position);

        for (const roleData of sortedRoles) {
            // Skip if role still exists
            if (guild.roles.cache.has(roleData.id)) {
                roleMap.set(roleData.id, roleData.id);
                continue;
            }

            // Check if a role with the same name exists
            const existingRole = guild.roles.cache.find(r => r.name === roleData.name);
            if (existingRole) {
                roleMap.set(roleData.id, existingRole.id);
                continue;
            }

            // Create the role
            const newRole = await safeAsync(async () => {
                return await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    hoist: roleData.hoist,
                    permissions: BigInt(roleData.permissions),
                    mentionable: roleData.mentionable,
                    reason: 'Server restore from backup'
                });
            }, `Failed to restore role: ${roleData.name}`);

            if (newRole) {
                roleMap.set(roleData.id, newRole.id);
                results.rolesRestored++;
            }
        }

        // Map of old channel IDs to new channel IDs
        const channelMap = new Map();

        // Restore categories first
        const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
        const sortedCategories = [...categories].sort((a, b) => a.position - b.position);

        for (const categoryData of sortedCategories) {
            // Skip if category still exists
            if (guild.channels.cache.has(categoryData.id)) {
                channelMap.set(categoryData.id, categoryData.id);
                continue;
            }

            // Check if a category with the same name exists
            const existingCategory = guild.channels.cache.find(c =>
                c.type === ChannelType.GuildCategory && c.name === categoryData.name
            );

            if (existingCategory) {
                channelMap.set(categoryData.id, existingCategory.id);
                continue;
            }

            // Create the category
            const newCategory = await safeAsync(async () => {
                return await guild.channels.create({
                    name: categoryData.name,
                    type: ChannelType.GuildCategory,
                    reason: 'Server restore from backup'
                });
            }, `Failed to restore category: ${categoryData.name}`);

            if (newCategory) {
                channelMap.set(categoryData.id, newCategory.id);
                results.channelsRestored++;

                // Restore permission overwrites
                if (categoryData.permissionOverwrites) {
                    for (const overwrite of categoryData.permissionOverwrites) {
                        // Map old role IDs to new ones
                        const targetId = roleMap.get(overwrite.id) || overwrite.id;

                        await safeAsync(async () => {
                            await newCategory.permissionOverwrites.create(
                                targetId,
                                {
                                    allow: BigInt(overwrite.allow),
                                    deny: BigInt(overwrite.deny)
                                },
                                { reason: 'Server restore from backup' }
                            );
                        }, `Failed to restore permission overwrite for ${categoryData.name}`);
                    }
                }
            }
        }

        // Restore channels within categories
        const channels = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
        const sortedChannels = [...channels].sort((a, b) => a.position - b.position);

        for (const channelData of sortedChannels) {
            // Skip if channel still exists
            if (guild.channels.cache.has(channelData.id)) {
                channelMap.set(channelData.id, channelData.id);
                continue;
            }

            // Check if a channel with the same name exists in the same category
            const parentId = channelData.parentId ? channelMap.get(channelData.parentId) : null;
            const existingChannel = guild.channels.cache.find(c =>
                c.name === channelData.name && c.parentId === parentId
            );

            if (existingChannel) {
                channelMap.set(channelData.id, existingChannel.id);
                continue;
            }

            // Create the channel
            const channelType = channelData.type === ChannelType.GuildVoice ?
                ChannelType.GuildVoice : ChannelType.GuildText;

            const newChannel = await safeAsync(async () => {
                return await guild.channels.create({
                    name: channelData.name,
                    type: channelType,
                    parent: parentId,
                    reason: 'Server restore from backup'
                });
            }, `Failed to restore channel: ${channelData.name}`);

            if (newChannel) {
                channelMap.set(channelData.id, newChannel.id);
                results.channelsRestored++;

                // Restore permission overwrites
                if (channelData.permissionOverwrites) {
                    for (const overwrite of channelData.permissionOverwrites) {
                        // Map old role IDs to new ones
                        const targetId = roleMap.get(overwrite.id) || overwrite.id;

                        await safeAsync(async () => {
                            await newChannel.permissionOverwrites.create(
                                targetId,
                                {
                                    allow: BigInt(overwrite.allow),
                                    deny: BigInt(overwrite.deny)
                                },
                                { reason: 'Server restore from backup' }
                            );
                        }, `Failed to restore permission overwrite for ${channelData.name}`);
                    }
                }
            }
        }

        console.log(`Backup restored successfully for ${guild.name}`);
        return {
            success: true,
            roleMap,
            channelMap,
            ...results
        };
    } catch (error) {
        console.error('Error restoring server backup:', error);
        throw error;
    }
}

/**
 * Save backup to file
 * @param {string} guildId Guild ID
 * @param {Object} backup Backup data
 * @returns {Promise<string>} Backup ID
 */
async function saveBackup(guildId, backup) {
    try {
        // Create backups directory if it doesn't exist
        const backupsDir = path.join(process.cwd(), 'data', 'backups', guildId);
        await fs.mkdir(backupsDir, { recursive: true });

        // Generate backup ID
        const backupId = `backup_${Date.now()}`;
        backup.backupId = backupId;

        // Save backup to file
        const backupPath = path.join(backupsDir, `${backupId}.json`);
        await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

        return backupId;
    } catch (error) {
        console.error('Error saving backup:', error);
        throw error;
    }
}

/**
 * Load backup from file
 * @param {string} guildId Guild ID
 * @param {string} backupId Backup ID
 * @returns {Promise<Object>} Backup data
 */
async function loadBackup(guildId, backupId) {
    try {
        const backupPath = path.join(process.cwd(), 'data', 'backups', guildId, `${backupId}.json`);
        const backupData = await fs.readFile(backupPath, 'utf8');
        return JSON.parse(backupData);
    } catch (error) {
        console.error('Error loading backup:', error);
        throw error;
    }
}

/**
 * List available backups for a guild
 * @param {string} guildId Guild ID
 * @returns {Promise<Array>} List of backup metadata
 */
async function listBackups(guildId) {
    try {
        const backupsDir = path.join(process.cwd(), 'data', 'backups', guildId);

        // Create directory if it doesn't exist
        await fs.mkdir(backupsDir, { recursive: true });

        // Get all backup files
        const files = await fs.readdir(backupsDir);
        const backupFiles = files.filter(file => file.endsWith('.json'));

        // Load metadata for each backup
        const backups = [];
        for (const file of backupFiles) {
            try {
                const backupPath = path.join(backupsDir, file);
                const backupData = await fs.readFile(backupPath, 'utf8');
                const backup = JSON.parse(backupData);

                backups.push({
                    backupId: backup.backupId,
                    timestamp: backup.timestamp,
                    guildName: backup.guildName,
                    channelCount: backup.channels.length,
                    roleCount: backup.roles.length
                });
            } catch (error) {
                console.error(`Error loading backup metadata from ${file}:`, error);
            }
        }

        // Sort by timestamp (newest first)
        return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('Error listing backups:', error);
        return [];
    }
}

module.exports = {
    createBackup,
    restoreFromBackup,
    saveBackup,
    loadBackup,
    listBackups
};