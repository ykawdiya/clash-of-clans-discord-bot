// Enhanced Discord Server Setup Script for Clash of Clans Bot
// - With cleanup functionality for existing content
// - With flexible clan configuration options

const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Set bot token from .env file or direct input
const TOKEN = process.env.DISCORD_TOKEN;
let SERVER_ID = process.env.GUILD_ID || null; // Using existing GUILD_ID from env

// ========= CLAN CONFIGURATION =========
// Edit this section to match your clan setup
const config = {
    // Basic info
    familyName: "YOUR CLAN FAMILY NAME",

    // Clan configuration - set enabled: false for clans you don't want to use
    clans: [
        {
            name: "Chatterbox",
            tag: "#2RUVGR2QQ",
            role: "main",
            enabled: true,           // Always keep your main clan enabled
            thLevel: "7+",
            description: "Friendly chatter"
        },
        {
            name: "FEEDER CLAN",
            tag: "#IJKLMNOP",
            role: "feeder",
            enabled: false,           // Set to false if you don't have a feeder clan
            thLevel: "10-12",
            description: "Development focused"
        },
        {
            name: "ACADEMY CLAN",
            tag: "#QRSTUVWX",
            role: "academy",
            enabled: false,          // Set to false if you don't have an academy clan
            thLevel: "7-9",
            description: "Learning environment"
        },
        // You can add more clans if needed by following the same pattern
        // {
        //   name: "ADDITIONAL CLAN",
        //   tag: "#XXXXXXXX",
        //   role: "other",
        //   enabled: false,
        //   thLevel: "X-Y",
        //   description: "Some description"
        // }
    ]
};

// Filter enabled clans for use throughout the script
const enabledClans = config.clans.filter(clan => clan.enabled);

// Get clan by role - helper function
function getClanByRole(role) {
    return enabledClans.find(clan => clan.role === role) || null;
}

// Get the main clan - helper function
function getMainClan() {
    return getClanByRole('main') || enabledClans[0] || null;
}

// ========= ROLE DEFINITIONS =========
// Base roles that are always created
const baseRoles = [
    // Primary roles
    { name: 'Administrator', color: Colors.Red, hoist: true, mentionable: true, permissions: [PermissionFlagsBits.Administrator] },
    { name: 'Leadership', color: Colors.Orange, hoist: true, mentionable: true, permissions: [
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ModerateMembers,
            PermissionFlagsBits.ManageNicknames
        ]},
    { name: 'Applicant', color: Colors.Grey, hoist: true, mentionable: true },

    // Secondary roles
    { name: 'Clan Leader', color: Colors.Gold, hoist: false, mentionable: true },
    { name: 'Co-Leader', color: Colors.LightGrey, hoist: false, mentionable: true },
    { name: 'Elder', color: Colors.Orange, hoist: false, mentionable: true },
    { name: 'War Player', color: Colors.DarkRed, hoist: false, mentionable: true },
    { name: 'Clan Games MVP', color: Colors.Purple, hoist: false, mentionable: true }
];

// Generate clan roles based on enabled clans
function generateClanRoles() {
    const roleColors = {
        main: Colors.Blue,
        feeder: Colors.Green,
        academy: Colors.Purple,
        other: Colors.Grey
    };

    return enabledClans.map(clan => ({
        name: clan.name,  // Use clan name as role name
        color: roleColors[clan.role] || Colors.Grey,
        hoist: true,
        mentionable: true
    }));
}

// Combine all roles
const roles = [...baseRoles, ...generateClanRoles()];

// ========= CATEGORY AND CHANNEL STRUCTURE =========
// Define base categories that are always created
const baseCategories = [
    {
        name: 'WELCOME & INFO',
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
        ],
        channels: [
            { name: 'welcome', type: ChannelType.GuildText },
            { name: 'rules', type: ChannelType.GuildText },
            { name: 'announcements', type: ChannelType.GuildText, customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AddReactions], deny: [PermissionFlagsBits.SendMessages] }
                ]},
            { name: 'verification', type: ChannelType.GuildText, customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]}
        ]
    },
    {
        name: 'BOT COMMANDS',
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
        ],
        channels: [
            { name: 'bot-commands', type: ChannelType.GuildText },
            { name: 'family-dashboard', type: ChannelType.GuildText, customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
                    { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]},
            { name: 'member-stats', type: ChannelType.GuildText, customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]}
        ]
    },
    {
        name: 'CLAN EVENTS',
        permissions: [
            { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            { name: 'clan-games', type: ChannelType.GuildText },
            { name: 'cwl-planning', type: ChannelType.GuildText },
            { name: 'capital-raids', type: ChannelType.GuildText },
            { name: 'achievements', type: ChannelType.GuildText }
        ],
        // Add permissions for each enabled clan
        dynamicPermissions: true
    },
    {
        name: 'COMMUNITY',
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ],
        channels: [
            { name: 'general-chat', type: ChannelType.GuildText },
            { name: 'clash-discussion', type: ChannelType.GuildText },
            { name: 'off-topic', type: ChannelType.GuildText },
            { name: 'memes-and-fun', type: ChannelType.GuildText }
        ]
    },
    {
        name: 'RECRUITMENT',
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Applicant', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            { name: 'join-our-clans', type: ChannelType.GuildText, customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]},
            { name: 'applications', type: ChannelType.GuildText }
        ]
    },
    {
        name: 'LEADERSHIP',
        permissions: [
            { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            { name: 'leadership-chat', type: ChannelType.GuildText },
            { name: 'bot-management', type: ChannelType.GuildText },
            { name: 'member-notes', type: ChannelType.GuildText }
        ]
    },
    {
        name: 'VOICE CHANNELS',
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] }
        ],
        channels: [
            { name: 'War Planning', type: ChannelType.GuildVoice },
            { name: 'General Voice', type: ChannelType.GuildVoice }
        ],
        // Add voice channels for each enabled clan
        dynamicChannels: true
    }
];

// Generate clan categories based on enabled clans
function generateClanCategories() {
    return enabledClans.map(clan => ({
        name: `${clan.name} [${clan.tag}]`,
        permissions: [
            { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: clan.name, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            { name: 'clan-info', type: ChannelType.GuildText, customPermissions: [
                    { id: clan.name, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]},
            { name: 'war-announcements', type: ChannelType.GuildText, customPermissions: [
                    { id: clan.name, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]},
            { name: 'war-strategy', type: ChannelType.GuildText },
            { name: 'clan-chat', type: ChannelType.GuildText },
            { name: 'donations', type: ChannelType.GuildText }
        ]
    }));
}

// Add dynamic permissions to categories that need them
function addDynamicPermissionsToCategories(categories) {
    return categories.map(category => {
        if (category.dynamicPermissions) {
            const clansPermissions = enabledClans.map(clan => ({
                id: clan.name,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }));

            return {
                ...category,
                permissions: [...category.permissions, ...clansPermissions]
            };
        }

        if (category.dynamicChannels && category.name === 'VOICE CHANNELS') {
            const clanVoiceChannels = enabledClans.map(clan => ({
                name: `${clan.name} Voice`,
                type: ChannelType.GuildVoice,
                customPermissions: [
                    { id: clan.name, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
                ]
            }));

            return {
                ...category,
                channels: [...category.channels, ...clanVoiceChannels]
            };
        }

        return category;
    });
}

// Combine all categories
const baseCategoriesWithDynamicPermissions = addDynamicPermissionsToCategories(baseCategories);
const clanCategories = generateClanCategories();
const categories = [...baseCategoriesWithDynamicPermissions, ...clanCategories];

// ========= CLEANUP FUNCTIONS =========
// Function to delete all channels
async function deleteAllChannels(guild) {
    console.log('Deleting all channels...');
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
        // Only delete channels, not categories yet
        if (channel.type !== ChannelType.GuildCategory) {
            try {
                console.log(`Deleting channel: ${channel.name}`);
                await channel.delete();
                // Add a small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error deleting channel ${channel.name}:`, error);
            }
        }
    }
    console.log('All channels deleted');
}

// Function to delete all categories
async function deleteAllCategories(guild) {
    console.log('Deleting all categories...');
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
        // Now delete categories
        if (channel.type === ChannelType.GuildCategory) {
            try {
                console.log(`Deleting category: ${channel.name}`);
                await channel.delete();
                // Add a small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error deleting category ${channel.name}:`, error);
            }
        }
    }
    console.log('All categories deleted');
}

// Function to delete all roles (except @everyone)
async function deleteAllRoles(guild) {
    console.log('Deleting all roles...');
    const roles = await guild.roles.fetch();

    for (const role of roles.values()) {
        // Don't delete @everyone or managed roles (like bot roles)
        if (role.id !== guild.id && !role.managed) {
            try {
                console.log(`Deleting role: ${role.name}`);
                await role.delete();
                // Add a small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error deleting role ${role.name}:`, error);
            }
        }
    }
    console.log('All roles deleted');
}

// ========= SETUP FUNCTIONS =========
// Function to create roles
async function createRoles(guild) {
    console.log('Creating roles...');
    // Store created roles for reference
    const createdRoles = {};

    for (const role of roles) {
        try {
            console.log(`Creating role: ${role.name}`);
            const newRole = await guild.roles.create({
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                permissions: role.permissions || []
            });
            createdRoles[role.name] = newRole;
            console.log(`Created role: ${role.name}`);
        } catch (error) {
            console.error(`Error creating role ${role.name}:`, error);
        }
    }

    return createdRoles;
}

// Function to create categories and channels
async function createChannels(guild, createdRoles) {
    console.log('Creating categories and channels...');

    for (const category of categories) {
        try {
            console.log(`Creating category: ${category.name}`);

            // Prepare permission overwrites
            const overwrites = [];
            for (const perm of category.permissions) {
                let roleId;

                if (perm.id === 'everyone') {
                    roleId = guild.id; // @everyone role
                } else if (perm.id === 'Bot') {
                    roleId = client.user.id; // Bot's role
                } else {
                    // Find the role by name
                    roleId = createdRoles[perm.id]?.id;
                    if (!roleId) {
                        console.warn(`Role not found for permission: ${perm.id}`);
                        continue;
                    }
                }

                overwrites.push({
                    id: roleId,
                    allow: perm.allow || [],
                    deny: perm.deny || []
                });
            }

            // Create category
            const newCategory = await guild.channels.create({
                name: category.name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwrites
            });

            // Create channels in this category
            for (const channel of category.channels) {
                console.log(`Creating channel: ${channel.name}`);

                // Prepare channel-specific permission overwrites
                let channelOverwrites = [...overwrites];

                if (channel.customPermissions) {
                    for (const perm of channel.customPermissions) {
                        let roleId;

                        if (perm.id === 'everyone') {
                            roleId = guild.id;
                        } else if (perm.id === 'Bot') {
                            roleId = client.user.id;
                        } else {
                            roleId = createdRoles[perm.id]?.id;
                            if (!roleId) {
                                console.warn(`Role not found for channel permission: ${perm.id}`);
                                continue;
                            }
                        }

                        // Check if this role already has permissions defined
                        const existingIndex = channelOverwrites.findIndex(ow => ow.id === roleId);

                        if (existingIndex !== -1) {
                            // Modify existing permissions
                            channelOverwrites[existingIndex] = {
                                id: roleId,
                                allow: [...channelOverwrites[existingIndex].allow, ...(perm.allow || [])],
                                deny: [...channelOverwrites[existingIndex].deny, ...(perm.deny || [])]
                            };
                        } else {
                            // Add new permission overwrites
                            channelOverwrites.push({
                                id: roleId,
                                allow: perm.allow || [],
                                deny: perm.deny || []
                            });
                        }
                    }
                }

                // Create the channel
                const newChannel = await guild.channels.create({
                    name: channel.name,
                    type: channel.type,
                    parent: newCategory,
                    permissionOverwrites: channelOverwrites
                });

                // Create webhook if needed (for specific channels)
                if (['war-announcements', 'clan-games', 'achievements', 'capital-raids'].includes(channel.name)) {
                    try {
                        const webhook = await newChannel.createWebhook({
                            name: `${channel.name.charAt(0).toUpperCase() + channel.name.slice(1).replace(/-/g, ' ')} Bot`,
                            reason: 'Automated notifications'
                        });
                        console.log(`Created webhook for ${channel.name}: ${webhook.url}`);

                        // Save webhook URL to a file for reference
                        const webhooksFile = path.join(__dirname, 'webhooks.txt');
                        fs.appendFileSync(webhooksFile, `${channel.name}: ${webhook.url}\n`);
                    } catch (webhookError) {
                        console.error(`Error creating webhook for ${channel.name}:`, webhookError);
                    }
                }
            }

            console.log(`Completed category: ${category.name}`);
        } catch (error) {
            console.error(`Error creating category ${category.name}:`, error);
        }
    }
}

// Function to add welcome content
async function addWelcomeContent(guild) {
    try {
        // Find welcome channel
        const welcomeChannel = guild.channels.cache.find(ch => ch.name === 'welcome');
        if (!welcomeChannel) {
            console.log('Welcome channel not found');
            return;
        }

        // Create clan list for welcome message
        const clanListText = enabledClans.map(clan =>
            `• **${clan.name}** - ${clan.tag} - TH${clan.thLevel} - ${clan.description}`
        ).join('\n');

        // Welcome message
        const welcomeMessage = `# Welcome to ${config.familyName}! 🏆

We're excited to have you join our Clash of Clans family! This server is the central hub for all members across our family of clans.

## Our Clan Family Structure

${clanListText}

## Bot Commands and Features

Our Discord bot helps manage all aspects of clan life:

• \`/link [YOUR PLAYER TAG]\` - Connect your CoC account to Discord
• \`/clan\` - View clan information for any clan in our family
• \`/player\` - Check your own or another player's stats
• \`/war\` - View current war information
• \`/stats\` - Track your progress over time
• \`/activity\` - Check your clan activity rating

For all commands, visit the #bot-commands channel!

## How to Get Set Up

1. **Link your account**: Use \`/link [YOUR PLAYER TAG]\` in #bot-commands
2. **Get your clan role**: An admin will assign you to your clan's role
3. **Explore your clan channels**: Each clan has its own channels under categories

## Server Rules

1. **Be respectful** to all members across all clans
2. **Follow in-game rules** for donations, war attacks, etc.
3. **Keep discussions** in the appropriate channels
4. **Use the bot** for all clan-related inquiries first
5. **Report issues** to Co-Leaders or Admins

Have questions? Tag @Leadership for help!`;

        await welcomeChannel.send(welcomeMessage);
        console.log('Posted welcome message');

        // Find rules channel
        const rulesChannel = guild.channels.cache.find(ch => ch.name === 'rules');
        if (!rulesChannel) {
            console.log('Rules channel not found');
            return;
        }

        // Rules message
        const rulesMessage = `# Server Rules and Expectations

## General Conduct
1. Treat all members with respect - no harassment, hate speech, or bullying
2. Keep conversations appropriate for all ages
3. No spamming, advertising, or excessive tagging
4. Use channels for their intended purpose
5. Follow Discord's Terms of Service

## Clan Participation
1. Link your Clash of Clans account using the bot
2. Maintain the minimum requirements for your assigned clan
3. Use both attacks in war if you opt in
4. Participate in clan events (Clan Games, Capital Raids, etc.)
5. Meet minimum donation requirements for your clan

## Bot Usage
1. Use bot commands in #bot-commands when possible
2. Do not spam bot commands
3. Report any bot issues to server admins
4. Follow instructions from bot notifications/reminders

## Clan Family Structure
1. Clan assignments are based on TH level and activity
2. Movement between clans must be approved by leadership
3. Respect the chain of command within each clan
4. Support fellow clan family members

## Discord Activity
1. Keep clan-specific discussions in the appropriate channels
2. Use threads for extended conversations when appropriate
3. Check announcements regularly for important updates
4. Participate in voice chats during war planning if possible

Violation of these rules may result in warnings, role restrictions, or removal from the server/clan family.`;

        await rulesChannel.send(rulesMessage);
        console.log('Posted rules message');

        // Find verification channel
        const verificationChannel = guild.channels.cache.find(ch => ch.name === 'verification');
        if (!verificationChannel) {
            console.log('Verification channel not found');
            return;
        }

        // Verification message
        const verificationMessage = `# Account Verification Process

Before accessing our clan channels, please verify your Clash of Clans account:

1. Type \`/link [YOUR PLAYER TAG]\` in this channel
2. The bot will check if you're a member of one of our clans
3. If verified, you'll automatically receive the appropriate clan role
4. If you're not in one of our clans yet, type \`/clan\` to see our clans and requirements

Need help finding your player tag? It's in your profile in-game, starting with #.

Having issues? Tag @Leadership for assistance.`;

        await verificationChannel.send(verificationMessage);
        console.log('Posted verification message');

        // Find clan-info channels and post templates for each enabled clan
        for (const clan of enabledClans) {
            const clanCategory = guild.channels.cache.find(
                ch => ch.type === ChannelType.GuildCategory && ch.name.includes(clan.name)
            );

            if (!clanCategory) {
                console.log(`Category for ${clan.name} not found`);
                continue;
            }

            const clanInfoChannel = guild.channels.cache.find(
                ch => ch.name === 'clan-info' && ch.parentId === clanCategory.id
            );

            if (!clanInfoChannel) {
                console.log(`Clan info channel for ${clan.name} not found`);
                continue;
            }

            const infoMessage = `# ${clan.name} Requirements and Information

## 🏆 About Us
• Clan Tag: ${clan.tag}
• Clan Level: XX
• War League: XXXXX
• Win/Loss: XXX/XXX
• Family Role: ${clan.role.charAt(0).toUpperCase() + clan.role.slice(1)}

## ⚔️ Requirements
• **Town Hall**: TH ${clan.thLevel}
• **Hero Levels**:
  - Requirements vary by TH level, check in-game
• **Troops**: Must have troops appropriate for your TH level
• **War Stars**: Active war participation expected

## 📊 Activity Expectations
• **Donations**: Request and donate regularly
• **Clan Games**: Minimum points based on TH level
• **Capital Contribution**: Weekly participation expected
• **War Participation**: Use all attacks if opted in

## 🚨 Rules
• Must use both attacks in regular wars if opted in
• Follow attack assignments in war when given
• Donate what is requested when possible
• Be respectful to all members
• Notify leadership if you'll be inactive for more than 3 days

## ⬆️ Promotion Requirements
• **Elder**: Achieved after consistent activity and donations
• **Co-Leader**: By invitation only after significant contribution

## 🔄 How to Join
1. Apply in-game with the message "From Discord"
2. Use \`/clan\` in #bot-commands to view clan details
3. Request an invite from a Co-Leader or Elder

Last Updated: ${new Date().toLocaleDateString()}`;

            await clanInfoChannel.send(infoMessage);
            console.log(`Posted clan info for ${clan.name}`);
        }

        // Find join-our-clans channel
        const recruitmentChannel = guild.channels.cache.find(ch => ch.name === 'join-our-clans');
        if (recruitmentChannel) {
            // Create clan list for recruitment
            const recruitmentText = enabledClans.map(clan => {
                return `## ${clan.name} (${clan.tag})
• **Town Hall Requirement**: TH${clan.thLevel}
• **Description**: ${clan.description}
• **How to Join**: Apply in-game with the message "From Discord"
`;
            }).join('\n');

            const recruitmentMessage = `# Join Our Clan Family

Looking for a new clan? We have several options depending on your Town Hall level and play style!

${recruitmentText}

## Application Process
1. Decide which clan is the best fit for your Town Hall level
2. Go to the #applications channel and let us know you want to join
3. A leader will review your profile and help you get set up

Questions? Tag @Leadership for assistance.`;

            await recruitmentChannel.send(recruitmentMessage);
            console.log('Posted recruitment message');
        }

        console.log('Added welcome content to server');
    } catch (error) {
        console.error('Error adding welcome content:', error);
    }
}

// Set up readline for user input
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Main function to set up a server
async function setupServer(guildId) {
    try {
        // Fetch the guild
        const guild = await client.guilds.fetch(guildId);
        console.log(`Setting up server: ${guild.name}`);

        // Display clan configuration
        console.log('\nClan Configuration:');
        console.log(`Family Name: ${config.familyName}`);
        console.log('Enabled Clans:');
        enabledClans.forEach((clan, index) => {
            console.log(`  ${index + 1}. ${clan.name} (${clan.tag}) - ${clan.role}`);
        });

        // Confirm with the user
        rl.question(`\nThis will DELETE ALL existing channels, categories, and roles in ${guild.name}, then create a new structure for your ${enabledClans.length} clan(s). This action cannot be undone. Continue? (yes/no): `, async (answer) => {
            if (answer.toLowerCase() !== 'yes') {
                console.log('Setup cancelled.');
                rl.close();
                process.exit(0);
                return;
            }

            console.log('Starting server cleanup and setup...');

            // CLEANUP PHASE
            console.log('=== CLEANUP PHASE ===');
            // Delete channels first to avoid category deletion issues
            await deleteAllChannels(guild);
            // Delete categories after channels
            await deleteAllCategories(guild);
            // Delete roles last
            await deleteAllRoles(guild);

            // SETUP PHASE
            console.log('=== SETUP PHASE ===');
            // Create roles first
            const createdRoles = await createRoles(guild);

            // Create channels and categories
            await createChannels(guild, createdRoles);

            // Add welcome content
            await addWelcomeContent(guild);

            console.log('Server setup completed successfully!');
            console.log(`\nCompleted Setup:`);
            console.log(`Roles created: ${Object.keys(createdRoles).length} roles`);
            console.log(`Categories created: ${categories.length} categories`);
            console.log(`Clan channels created: ${enabledClans.length} clan areas`);
            console.log('\nImportant next steps:');
            console.log('1. Configure your Clash of Clans bot with your clan tags');
            console.log('2. Use the bot\'s /setclan command to link your main clan');
            console.log('3. Create your clan family with /clanfamily create');
            console.log('4. Add additional clans with /clanfamily add');
            console.log('5. Check webhooks.txt file for webhook URLs for bot configuration');

            rl.close();
            process.exit(0);
        });
    } catch (error) {
        console.error('Error setting up server:', error);
        rl.close();
        process.exit(1);
    }
}

// Client event handlers
client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);

    if (SERVER_ID) {
        setupServer(SERVER_ID);
    } else {
        // List available servers and let user choose
        console.log('Available servers:');
        client.guilds.cache.forEach((guild, id) => {
            console.log(`${id}: ${guild.name}`);
        });

        rl.question('Enter the ID of the server you want to set up: ', (id) => {
            SERVER_ID = id.trim();
            setupServer(SERVER_ID);
        });
    }
});

// Log in to Discord
console.log('Logging in to Discord...');
client.login(TOKEN).catch(error => {
    console.error('Error logging in:', error);
    process.exit(1);
});