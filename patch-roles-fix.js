// patch-roles-fix.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function patchRolesFile() {
    // Path to the roles.js file
    const filePath = path.join(__dirname, 'src', 'commands', 'admin', 'roles.js');

    console.log(`Reading roles.js file from ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // Create a backup first
    fs.writeFileSync(`${filePath}.bak`, content);
    console.log('Created backup of original file');

    console.log('Patching setupTownHallRoles function...');

    // Fix town hall roles storage field name
    content = content.replace(
        /linkedClan\.settings\.roles\.townHall(Roles)?\s*=\s*thRoles/g,
        'linkedClan.settings.roles.townHall = thRoles'
    );

    // Fix town hall roles reference in showRoleConfig
    content = content.replace(
        /if\s*\(\s*linkedClan\.settings\.roles\.townHall(Roles)?\s*\)/g,
        'if (linkedClan.settings.roles.townHall)'
    );
    content = content.replace(
        /Object\.entries\(\s*linkedClan\.settings\.roles\.townHall(Roles)?\s*\)/g,
        'Object.entries(linkedClan.settings.roles.townHall)'
    );

    // Fix war activity roles storage field name
    content = content.replace(
        /linkedClan\.settings\.roles\.warActivity(Roles)?\s*=\s*warRoles/g,
        'linkedClan.settings.roles.warActivity = warRoles'
    );

    // Fix war activity roles reference in showRoleConfig
    content = content.replace(
        /if\s*\(\s*linkedClan\.settings\.roles\.warActivity(Roles)?\s*\)/g,
        'if (linkedClan.settings.roles.warActivity)'
    );
    content = content.replace(
        /Object\.entries\(\s*linkedClan\.settings\.roles\.warActivity(Roles)?\s*\)/g,
        'Object.entries(linkedClan.settings.roles.warActivity)'
    );

    // Fix donation tier roles storage field name
    content = content.replace(
        /linkedClan\.settings\.roles\.donationTier(Roles)?\s*=\s*donationRoles/g,
        'linkedClan.settings.roles.donationTier = donationRoles'
    );

    // Fix donation tier roles reference in showRoleConfig
    content = content.replace(
        /if\s*\(\s*linkedClan\.settings\.roles\.donationTier(Roles)?\s*\)/g,
        'if (linkedClan.settings.roles.donationTier)'
    );
    content = content.replace(
        /Object\.entries\(\s*linkedClan\.settings\.roles\.donationTier(Roles)?\s*\)/g,
        'Object.entries(linkedClan.settings.roles.donationTier)'
    );

    // Fix assignAllRoles function references
    content = content.replace(
        /if\s*\(\s*roleConfig\.townHall(Roles)?\s*\)/g,
        'if (roleConfig.townHall)'
    );
    content = content.replace(
        /await\s+assignTownHallRole\(member,\s*playerData\.townHallLevel,\s*roleConfig\.townHall(Roles)?\)/g,
        'await assignTownHallRole(member, playerData.townHallLevel, roleConfig.townHall)'
    );

    content = content.replace(
        /if\s*\(\s*roleConfig\.warActivity(Roles)?\s*\)/g,
        'if (roleConfig.warActivity)'
    );
    content = content.replace(
        /await\s+assignWarActivityRole\(member,\s*warStars,\s*roleConfig\.warActivity(Roles)?\)/g,
        'await assignWarActivityRole(member, warStars, roleConfig.warActivity)'
    );

    content = content.replace(
        /if\s*\(\s*roleConfig\.donationTier(Roles)?\s*\)/g,
        'if (roleConfig.donationTier)'
    );
    content = content.replace(
        /await\s+assignDonationRole\(member,\s*donations,\s*roleConfig\.donationTier(Roles)?\)/g,
        'await assignDonationRole(member, donations, roleConfig.donationTier)'
    );

    // Fix removeAllClanRoles function as well
    content = content.replace(
        /if\s*\(\s*roleConfig\.townHall(Roles)?\s*\)/g,
        'if (roleConfig.townHall)'
    );
    content = content.replace(
        /Object\.values\(\s*roleConfig\.townHall(Roles)?\s*\)/g,
        'Object.values(roleConfig.townHall)'
    );

    content = content.replace(
        /if\s*\(\s*roleConfig\.warActivity(Roles)?\s*\)/g,
        'if (roleConfig.warActivity)'
    );
    content = content.replace(
        /Object\.keys\(\s*roleConfig\.warActivity(Roles)?\s*\)/g,
        'Object.keys(roleConfig.warActivity)'
    );

    content = content.replace(
        /if\s*\(\s*roleConfig\.donationTier(Roles)?\s*\)/g,
        'if (roleConfig.donationTier)'
    );
    content = content.replace(
        /Object\.keys\(\s*roleConfig\.donationTier(Roles)?\s*\)/g,
        'Object.keys(roleConfig.donationTier)'
    );

    // Fix clan roles sync function references
    content = content.replace(/console\.log\('TownHall Roles:.*\)\);/g, `console.log('TownHall Roles:', JSON.stringify(linkedClan.settings.roles.townHall || {}));`);
    content = content.replace(/console\.log\('Clan Roles:.*\)\);/g, `console.log('Clan Roles:', JSON.stringify({leader: linkedClan.settings.roles.leader, coLeader: linkedClan.settings.roles.coLeader, elder: linkedClan.settings.roles.elder, member: linkedClan.settings.roles.everyone}));`);
    content = content.replace(/console\.log\('War Roles:.*\)\);/g, `console.log('War Roles:', JSON.stringify(linkedClan.settings.roles.warActivity || {}));`);
    content = content.replace(/console\.log\('Donation Roles:.*\)\);/g, `console.log('Donation Roles:', JSON.stringify(linkedClan.settings.roles.donationTier || {}));`);

    // Add direct updateOne calls for critical save operations

    // Town Hall roles save
    const thSavePattern = /try\s*\{\s*\/\/\s*Log the data we're trying to save\s*console\.log\('Saving TH role configuration to database:.*\);/;
    const thSaveReplacement = `try {
        // Log the data we're trying to save
        console.log('Saving TH role configuration to database:', JSON.stringify(thRoles));
        
        // Use direct updateOne for more reliable update
        const updateResult = await Clan.updateOne(
            { _id: linkedClan._id },
            { $set: { 'settings.roles.townHall': thRoles } }
        );
        console.log('TH roles update result:', updateResult);
        
        // Update our local reference
        linkedClan.settings.roles.townHall = thRoles;`;

    content = content.replace(thSavePattern, thSaveReplacement);

    // Write updated file
    fs.writeFileSync(filePath, content);
    console.log('Patched roles.js file successfully');
}

patchRolesFile();