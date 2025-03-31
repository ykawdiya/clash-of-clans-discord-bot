// src/utils/permissions.js
const { system: log } = require('./logger');

/**
 * Check if user has required permissions based on roles
 * @param {Interaction} interaction - Discord interaction
 * @param {Array} requiredRoles - Array of roles required
 * @param {Boolean} requireAll - Whether all roles are required or just one
 * @returns {Boolean} - Whether user has permission
 */
async function userPermission(interaction, requiredRoles, requireAll = false) {
  try {
    // Allow guild owner always
    if (interaction.guild.ownerId === interaction.user.id) {
      return true;
    }
    
    // Get member roles
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const memberRoles = member.roles.cache.map(r => r.name);
    
    // Check for admin role which always has permission
    if (memberRoles.includes('Bot Admin') || memberRoles.includes('Admin')) {
      return true;
    }
    
    // Check for required roles
    if (requireAll) {
      // Must have all required roles
      return requiredRoles.every(role => memberRoles.includes(role));
    } else {
      // Must have at least one required role
      return requiredRoles.some(role => memberRoles.includes(role));
    }
  } catch (error) {
    log.error('Error checking user permissions:', { error: error.message });
    return false;
  }
}

/**
 * Check if command is allowed in channel
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} permissionsMap - Command permissions map
 * @returns {Boolean} - Whether command is allowed
 */
function channelPermission(interaction, permissionsMap) {
  try {
    const channelName = interaction.channel.name;
    const commandName = interaction.commandName;
    const memberRoles = interaction.member.roles.cache.map(r => r.name);
    
    // Get channel permissions
    const channelPerms = permissionsMap[channelName];
    
    // If no specific permissions, allow the command
    if (!channelPerms) return true;
    
    // Check if command is allowed in this channel
    if (!channelPerms.allowedCommands.includes(commandName)) {
      return false;
    }
    
    // Check if user has required role
    const hasRole = channelPerms.allowedRoles.some(role => 
      role === "@everyone" || memberRoles.includes(role)
    );
    
    return hasRole;
  } catch (error) {
    log.error('Error checking channel permissions:', { error: error.message });
    return true; // Default to allowing if error
  }
}

// General permission middleware for commands
function permissionMiddleware(permissionsMap) {
  return async (interaction) => {
    if (!channelPermission(interaction, permissionsMap)) {
      return {
        allowed: false,
        message: `This command cannot be used in this channel. Try using it in the appropriate channel.`
      };
    }
    
    return {
      allowed: true
    };
  };
}

module.exports = {
  userPermission,
  channelPermission,
  permissionMiddleware
};
