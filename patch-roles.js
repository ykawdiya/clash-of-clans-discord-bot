// patch-roles.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function patchRolesFile() {
    // Path to the roles.js file
    const filePath = path.join(__dirname, 'src', 'commands', 'admin', 'roles.js');

    console.log(`Reading roles.js file from ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    console.log('Patching Town Hall Roles function...');
    // Replace townHall with townHallRoles
    content = content.replace(
        /linkedClan\.settings\.roles\.townHall(\s*=\s*thRoles)/g,
        'linkedClan.settings.roles.townHallRoles$1'
    );

    console.log('Patching War Activity Roles function...');
    // Replace warActivity with warActivityRoles
    content = content.replace(
        /linkedClan\.settings\.roles\.warActivity(\s*=\s*warRoles)/g,
        'linkedClan.settings.roles.warActivityRoles$1'
    );

    console.log('Patching Donation Tier Roles function...');
    // Replace donationTier with donationTierRoles
    content = content.replace(
        /linkedClan\.settings\.roles\.donationTier(\s*=\s*donationRoles)/g,
        'linkedClan.settings.roles.donationTierRoles$1'
    );

    // Update references in showRoleConfig
    console.log('Updating showRoleConfig function...');
    content = content.replace(
        /if \(linkedClan\.settings\.roles\.townHall\)/g,
        'if (linkedClan.settings.roles.townHallRoles)'
    );
    content = content.replace(
        /Object\.entries\(linkedClan\.settings\.roles\.townHall\)/g,
        'Object.entries(linkedClan.settings.roles.townHallRoles)'
    );

    content = content.replace(
        /if \(linkedClan\.settings\.roles\.warActivity\)/g,
        'if (linkedClan.settings.roles.warActivityRoles)'
    );
    content = content.replace(
        /Object\.entries\(linkedClan\.settings\.roles\.warActivity\)/g,
        'Object.entries(linkedClan.settings.roles.warActivityRoles)'
    );

    content = content.replace(
        /if \(linkedClan\.settings\.roles\.donationTier\)/g,
        'if (linkedClan.settings.roles.donationTierRoles)'
    );
    content = content.replace(
        /Object\.entries\(linkedClan\.settings\.roles\.donationTier\)/g,
        'Object.entries(linkedClan.settings.roles.donationTierRoles)'
    );

    // Update references in assignAllRoles
    console.log('Updating assignAllRoles function...');
    content = content.replace(
        /if \(roleConfig\.townHall\)/g,
        'if (roleConfig.townHallRoles)'
    );
    content = content.replace(
        /await assignTownHallRole\(member, playerData\.townhallLevel, roleConfig\.townHall\)/g,
        'await assignTownHallRole(member, playerData.townhallLevel, roleConfig.townHallRoles)'
    );

    content = content.replace(
        /if \(roleConfig\.warActivity\)/g,
        'if (roleConfig.warActivityRoles)'
    );
    content = content.replace(
        /await assignWarActivityRole\(member, warStars, roleConfig\.warActivity\)/g,
        'await assignWarActivityRole(member, warStars, roleConfig.warActivityRoles)'
    );

    content = content.replace(
        /if \(roleConfig\.donationTier/g,
        'if (roleConfig.donationTierRoles'
    );
    content = content.replace(
        /await assignDonationRole\(member, donations, roleConfig\.donationTier\)/g,
        'await assignDonationRole(member, donations, roleConfig.donationTierRoles)'
    );

    // Update checks in removeAllClanRoles
    console.log('Updating removeAllClanRoles function...');
    content = content.replace(
        /if \(roleConfig\.townHall\)/g,
        'if (roleConfig.townHallRoles)'
    );
    content = content.replace(
        /Object\.values\(roleConfig\.townHall\)/g,
        'Object.values(roleConfig.townHallRoles)'
    );

    content = content.replace(
        /if \(roleConfig\.warActivity\)/g,
        'if (roleConfig.warActivityRoles)'
    );
    content = content.replace(
        /Object\.keys\(roleConfig\.warActivity\)/g,
        'Object.keys(roleConfig.warActivityRoles)'
    );

    content = content.replace(
        /if \(roleConfig\.donationTier\)/g,
        'if (roleConfig.donationTierRoles)'
    );
    content = content.replace(
        /Object\.keys\(roleConfig\.donationTier\)/g,
        'Object.keys(roleConfig.donationTierRoles)'
    );

    console.log('Creating backup of original file...');
    fs.writeFileSync(`${filePath}.bak`, fs.readFileSync(filePath));

    console.log('Writing updated file...');
    fs.writeFileSync(filePath, content);

    console.log('Patch complete!');
}

patchRolesFile();