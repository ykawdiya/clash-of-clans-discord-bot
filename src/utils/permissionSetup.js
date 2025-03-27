// src/utils/permissionSetup.js
const { PermissionFlagsBits, PermissionsBitField, ChannelType } = require('discord.js');

/**
 * Set up permissions for roles and channels
 * @param {Guild} guild Discord guild
 * @param {String} templateName Permission template to use (standard, strict, open)
 * @param {Array} channels Array of channel objects created
 * @param {Array} roles Array of role objects created
 * @returns {Promise<Object>} Result statistics
 */
async function setupPermissions(guild, templateName = 'standard', channels = [], roles = []) {
    // Add delay to avoid rate limits
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Get existing roles if not provided
    if (!roles || roles.length === 0) {
        roles = guild.roles.cache.map(r => ({
            id: r.id,
            name: r.name
        }));
    }

    // Get existing channels if not provided
    if (!channels || channels.length === 0) {
        channels = guild.channels.cache.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type
        }));
    }

    // Find role IDs for different role types
    const roleIds = {
        everyone: guild.id, // @everyone role
        leader: findRoleId(roles, 'leader'),
        coLeader: findRoleId(roles, 'co-leader'),
        elder: findRoleId(roles, 'elder'),
        member: findRoleId(roles, 'member'),
        botAdmin: findRoleId(roles, 'bot admin'),
        warGeneral: findRoleId(roles, 'war general'),
        warTeam: findRoleId(roles, 'war team')
    };

    // Statistics for tracking results
    const results = {
        channelsUpdated: 0,
        permissionsSet: 0,
        errors: 0
    };

    // Process each channel
    for (const channelData of channels) {
        try {
            // Fetch the actual channel object
            const channel = await guild.channels.fetch(channelData.id);
            if (!channel) continue;

            // Skip if this is not a category or text/voice channel
            if (![ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildVoice].includes(channel.type)) {
                continue;
            }

            // Get permission overwrites based on channel and template
            const permissions = getChannelPermissions(channel.name, channel.type, templateName, roleIds);

            // Apply each permission overwrite
            for (const [roleId, permissionOverwrites] of Object.entries(permissions)) {
                // Skip if role doesn't exist
                if (!roleId || roleId === 'undefined') continue;

                try {
                    await channel.permissionOverwrites.edit(roleId, permissionOverwrites);
                    results.permissionsSet++;

                    // Add small delay to avoid rate limits
                    await wait(50);
                } catch (error) {
                    console.error(`Error setting permissions for ${channel.name} (${roleId}):`, error);
                    results.errors++;
                }
            }

            results.channelsUpdated++;
        } catch (error) {
            console.error(`Error processing channel ${channelData.id}:`, error);
            results.errors++;
        }
    }

    return results;
}

/**
 * Find a role ID by name
 * @param {Array} roles Array of role objects
 * @param {String} name Role name to search for
 * @returns {String|null} Role ID or null if not found
 */
function findRoleId(roles, name) {
    // Case-insensitive search
    name = name.toLowerCase();

    // Try to find a matching role
    const role = roles.find(r =>
        r.name.toLowerCase() === name ||
        r.name.toLowerCase() === `coc ${name}`
    );

    return role ? role.id : null;
}

/**
 * Get permission overwrites for a channel
 * @param {String} channelName Name of the channel
 * @param {Number} channelType Type of channel
 * @param {String} template Permission template name
 * @param {Object} roleIds Map of role names to IDs
 * @returns {Object} Permission overwrites for each role
 */
function getChannelPermissions(channelName, channelType, template, roleIds) {
    // Normalize channel name for easier matching
    const name = channelName.toLowerCase();

    // Default permissions based on template
    const permissions = {
        // @everyone role (default deny all for security)
        [roleIds.everyone]: {
            ViewChannel: false
        }
    };

    // Add role-specific permissions based on template
    if (template === 'standard') {
        // Standard template is balanced for most clans
        if (roleIds.leader) {
            permissions[roleIds.leader] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                ManageMessages: true,
                ManageThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.coLeader) {
            permissions[roleIds.coLeader] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                ManageMessages: true,
                ManageThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.elder) {
            permissions[roleIds.elder] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }
    } else if (template === 'strict') {
        // Strict template has more controlled permissions
        if (roleIds.leader) {
            permissions[roleIds.leader] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                ManageMessages: true,
                ManageThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.coLeader) {
            permissions[roleIds.coLeader] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                ManageMessages: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.elder) {
            permissions[roleIds.elder] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                UseExternalEmojis: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }

        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                AddReactions: true,
                Connect: true,
                Speak: true
            };
        }
    } else if (template === 'open') {
        // Open template has more relaxed permissions
        // Give @everyone basic access
        permissions[roleIds.everyone] = {
            ViewChannel: true,
            SendMessages: true,
            SendMessagesInThreads: true,
            AttachFiles: true,
            AddReactions: true,
            Connect: true,
            Speak: true
        };

        if (roleIds.leader) {
            permissions[roleIds.leader] = {
                ManageMessages: true,
                ManageThreads: true,
                ManageChannel: true
            };
        }

        if (roleIds.coLeader) {
            permissions[roleIds.coLeader] = {
                ManageMessages: true,
                ManageThreads: true
            };
        }
    }

    // Apply special permissions for specific channel types
    if (channelType === ChannelType.GuildCategory) {
        // Categories get permissions that child channels inherit
        return permissions;
    }

    // Special channel types, overriding the template

    // Bot commands channel
    if (name.includes('bot') || name.includes('command')) {
        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true
            };
        }

        // Override @everyone to allow viewing
        permissions[roleIds.everyone] = {
            ViewChannel: true
        };
    }

    // Announcement channels
    if (name.includes('announce') || name.includes('news')) {
        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: true,
                SendMessages: false,
                AddReactions: true
            };
        }

        if (roleIds.elder) {
            permissions[roleIds.elder] = {
                ViewChannel: true,
                SendMessages: false,
                AddReactions: true
            };
        }

        // Give write access to leaders and co-leaders
        if (roleIds.coLeader) {
            permissions[roleIds.coLeader] = {
                ViewChannel: true,
                SendMessages: true,
                ManageMessages: true
            };
        }

        // Override @everyone to allow viewing
        permissions[roleIds.everyone] = {
            ViewChannel: true,
            SendMessages: false
        };
    }

    // Rules channel
    if (name.includes('rule') || name.includes('info')) {
        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: true,
                SendMessages: false,
                AddReactions: false
            };
        }

        // Override @everyone to allow viewing but not sending
        permissions[roleIds.everyone] = {
            ViewChannel: true,
            SendMessages: false
        };
    }

    // War channels
    if (name.includes('war')) {
        // War log is view-only for members
        if (name.includes('log') || name.includes('result')) {
            if (roleIds.member) {
                permissions[roleIds.member] = {
                    ViewChannel: true,
                    SendMessages: false,
                    AddReactions: true
                };
            }

            // Allow co-leaders and war generals to post results
            if (roleIds.coLeader) {
                permissions[roleIds.coLeader] = {
                    ViewChannel: true,
                    SendMessages: true,
                    ManageMessages: true
                };
            }

            if (roleIds.warGeneral) {
                permissions[roleIds.warGeneral] = {
                    ViewChannel: true,
                    SendMessages: true,
                    ManageMessages: true
                };
            }
        }

        // War planning has restricted access
        if (name.includes('plan') || name.includes('strategy')) {
            if (roleIds.member) {
                permissions[roleIds.member] = {
                    ViewChannel: false
                };
            }

            if (roleIds.elder) {
                permissions[roleIds.elder] = {
                    ViewChannel: true,
                    SendMessages: true,
                    AddReactions: true
                };
            }

            if (roleIds.warTeam) {
                permissions[roleIds.warTeam] = {
                    ViewChannel: true,
                    SendMessages: true,
                    AddReactions: true
                };
            }
        }
    }

    // Admin channels
    if (name.includes('admin') || name.includes('staff') || name.includes('leader')) {
        // Restrict to co-leaders and up
        if (roleIds.member) {
            permissions[roleIds.member] = {
                ViewChannel: false
            };
        }

        if (roleIds.elder) {
            permissions[roleIds.elder] = {
                ViewChannel: false
            };
        }

        if (roleIds.coLeader) {
            permissions[roleIds.coLeader] = {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                AttachFiles: true,
                AddReactions: true
            };
        }
    }

    return permissions;
}

module.exports = {
    setupPermissions
};