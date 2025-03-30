// fix-show-roles.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function fixShowRoleConfig() {
    // Path to the roles.js file
    const filePath = path.join(__dirname, 'src', 'commands', 'admin', 'roles.js');

    console.log(`Reading roles.js file from ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // Create a backup
    fs.writeFileSync(`${filePath}.bak3`, content);
    console.log('Created backup of original file');

    // Replace the entire showRoleConfig function with a more robust version
    const showRoleConfigPattern = /async function showRoleConfig\(interaction, linkedClan\) \{[\s\S]+?return interaction\.editReply\(\{ embeds: \[embed\] \}\);[\s\S]+?\}/;

    const robustShowRoleConfig = `async function showRoleConfig(interaction, linkedClan) {
    // Check if role settings exist
    if (!linkedClan.settings || !linkedClan.settings.roles) {
        return interaction.editReply('No role configuration found. Use \`/roles setup\` first.');
    }

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Role Configuration')
        .setDescription(\`Role configuration for \${linkedClan.name} (\${linkedClan.clanTag})\`);

    // Add Town Hall roles if configured
    if (linkedClan.settings.roles.townHall && Object.keys(linkedClan.settings.roles.townHall).length > 0) {
        let thRolesText = '';
        for (const [level, config] of Object.entries(linkedClan.settings.roles.townHall)) {
            try {
                if (config && config.id) {
                    const role = interaction.guild.roles.cache.get(config.id);
                    if (role) {
                        thRolesText += \`TH\${level}: \${role.name} <@&\${role.id}>\\n\`;
                    }
                }
            } catch (error) {
                console.error(\`Error getting role for TH\${level}:\`, error);
            }
        }

        if (thRolesText) {
            embed.addFields({ name: 'Town Hall Roles', value: thRolesText });
        }
    }

    // Add clan roles if configured
    if (linkedClan.settings.roles) {
        let clanRolesText = '';
        
        // Get role IDs from the settings object
        const leaderRole = linkedClan.settings.roles.leader;
        const coLeaderRole = linkedClan.settings.roles.coLeader;
        const elderRole = linkedClan.settings.roles.elder;
        const memberRole = linkedClan.settings.roles.everyone || linkedClan.settings.roles.member;
        
        // Add Leader role if configured
        if (leaderRole) {
            try {
                const role = interaction.guild.roles.cache.get(leaderRole);
                if (role) {
                    clanRolesText += \`Leader: \${role.name} <@&\${role.id}>\\n\`;
                }
            } catch (error) {
                console.error('Error getting Leader role:', error);
            }
        }
        
        // Add Co-Leader role if configured
        if (coLeaderRole) {
            try {
                const role = interaction.guild.roles.cache.get(coLeaderRole);
                if (role) {
                    clanRolesText += \`Co-Leader: \${role.name} <@&\${role.id}>\\n\`;
                }
            } catch (error) {
                console.error('Error getting Co-Leader role:', error);
            }
        }
        
        // Add Elder role if configured
        if (elderRole) {
            try {
                const role = interaction.guild.roles.cache.get(elderRole);
                if (role) {
                    clanRolesText += \`Elder: \${role.name} <@&\${role.id}>\\n\`;
                }
            } catch (error) {
                console.error('Error getting Elder role:', error);
            }
        }
        
        // Add Member role if configured
        if (memberRole) {
            try {
                const role = interaction.guild.roles.cache.get(memberRole);
                if (role) {
                    clanRolesText += \`Member: \${role.name} <@&\${role.id}>\\n\`;
                }
            } catch (error) {
                console.error('Error getting Member role:', error);
            }
        }

        if (clanRolesText) {
            embed.addFields({ name: 'Clan Roles', value: clanRolesText });
        }
    }

    // Add war activity roles if configured
    if (linkedClan.settings.roles.warActivity && Object.keys(linkedClan.settings.roles.warActivity).length > 0) {
        let warRolesText = '';
        for (const [roleId, config] of Object.entries(linkedClan.settings.roles.warActivity)) {
            try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role && config && config.minStars !== undefined) {
                    warRolesText += \`\${role.name}: \${config.minStars}+ war stars\\n\`;
                }
            } catch (error) {
                console.error(\`Error getting war activity role:\`, error);
            }
        }

        if (warRolesText) {
            embed.addFields({ name: 'War Activity Roles', value: warRolesText });
        }
    }

    // Add donation tier roles if configured
    if (linkedClan.settings.roles.donationTier && Object.keys(linkedClan.settings.roles.donationTier).length > 0) {
        let donationRolesText = '';
        for (const [roleId, config] of Object.entries(linkedClan.settings.roles.donationTier)) {
            try {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role && config && config.minDonations !== undefined) {
                    donationRolesText += \`\${role.name}: \${config.minDonations}+ donations\\n\`;
                }
            } catch (error) {
                console.error(\`Error getting donation tier role:\`, error);
            }
        }

        if (donationRolesText) {
            embed.addFields({ name: 'Donation Tier Roles', value: donationRolesText });
        }
    }

    return interaction.editReply({ embeds: [embed] });
}`;

    if (content.match(showRoleConfigPattern)) {
        content = content.replace(showRoleConfigPattern, robustShowRoleConfig);
        fs.writeFileSync(filePath, content);
        console.log('Successfully replaced showRoleConfig function with more robust version');
    } else {
        console.log('Could not find showRoleConfig pattern. Manual fix needed.');
    }
}

fixShowRoleConfig();