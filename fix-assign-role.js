// fix-assign-role.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function fixAssignClanRole() {
    // Path to the roles.js file
    const filePath = path.join(__dirname, 'src', 'commands', 'admin', 'roles.js');

    console.log(`Reading roles.js file from ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // Create a backup
    fs.writeFileSync(`${filePath}.bak2`, content);
    console.log('Created backup of original file');

    // Find and fix the assignClanRole function
    const assignClanRolePattern = /async function assignClanRole\(member, clanRole, clanRoleConfig\) \{[\s\S]+?const roleKey = roleMap\[lowerRole\] \|\| 'member';/;

    if (content.match(assignClanRolePattern)) {
        const fixedAssignClanRole = `async function assignClanRole(member, clanRole, clanRoleConfig) {
    try {
        console.log(\`Starting clan role assignment for \${member.user.tag}, role="\${clanRole}"\`);

        // Map the CoC role to our config key
        const roleMap = {
            'leader': 'leader',
            'coLeader': 'coLeader',
            'co-leader': 'coLeader',
            'admin': 'coLeader', // Some versions use admin instead of coLeader
            'elder': 'elder',
            'member': 'everyone'  // FIXED: Use "everyone" instead of "member" to match DB
        };

        // Convert to lowercase for case-insensitive matching
        const lowerRole = (clanRole || '').toLowerCase();
        const roleKey = roleMap[lowerRole] || 'everyone';  // FIXED: Default to "everyone"`;

        content = content.replace(assignClanRolePattern, fixedAssignClanRole);

        // Also fix references to "member" in the rest of the assignClanRole function
        content = content.replace(/const roleId = clanRoleConfig\[roleKey\];/g,
            `// Get role ID based on roleKey
        let roleId;
        if (roleKey === 'leader') {
            roleId = clanRoleConfig.leader;
        } else if (roleKey === 'coLeader') {
            roleId = clanRoleConfig.coLeader;
        } else if (roleKey === 'elder') {
            roleId = clanRoleConfig.elder;
        } else {
            roleId = clanRoleConfig.everyone;
        }`);

        // Write updated file
        fs.writeFileSync(filePath, content);
        console.log('Fixed assignClanRole function to use correct role mapping');
    } else {
        console.log('Could not find assignClanRole function pattern. Manual fix needed.');
    }
}

fixAssignClanRole();