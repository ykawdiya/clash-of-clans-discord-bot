// Add this utility function to src/utils/permissions.js
async function hasRequiredRole(member, requiredLevel) {
    const roleHierarchy = {
        'leader': 3,
        'co-leader': 2,
        'elder': 1,
        'member': 0
    };

    // Check if they have any of the roles directly
    const hasRole = member.roles.cache.some(role =>
        role.name.toLowerCase() === requiredLevel.toLowerCase() ||
        role.name.toLowerCase() === 'coc ' + requiredLevel.toLowerCase()
    );

    if (hasRole) return true;

    // Check for higher roles
    const requiredValue = roleHierarchy[requiredLevel.toLowerCase()] || 0;

    for (const [roleName, value] of Object.entries(roleHierarchy)) {
        if (value > requiredValue && member.roles.cache.some(r =>
            r.name.toLowerCase() === roleName ||
            r.name.toLowerCase() === 'coc ' + roleName
        )) {
            return true;
        }
    }

    return false;
}

// Export the function
module.exports = { hasRequiredRole };