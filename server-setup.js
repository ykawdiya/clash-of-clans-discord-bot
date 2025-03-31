// Enhanced Discord Server Setup Script for Clash of Clans Bot
// - With detailed channel descriptions, organization, and sophisticated permissions
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
    familyDescription: "A family of Clash of Clans clans focused on growth, strategy, and community",
    serverIconURL: "", // Optional: URL to an image for server icon

    // Clan configuration - set enabled: false for clans you don't want to use
    clans: [
        {
            name: "Chatterbox",
            tag: "#2RUVGR2QQ",
            role: "main",
            enabled: true,           // Always keep your main clan enabled
            thLevel: "11+",
            description: "Our competitive war clan focused on high-level strategy and CWL performance. Minimum TH11",
            requirements: "TH11+",
            warFrequency: "Constant"
        },
        {
            name: "FEEDER CLAN",
            tag: "#IJKLMNOP",
            role: "feeder",
            enabled: false,           // Set to false if you don't have a feeder clan
            thLevel: "10-12",
            description: "Development clan for TH10-12 players looking to improve war skills and upgrade efficiently.",
            requirements: "TH10+, 40/40/10 heroes, 70%+ max troops for TH level",
            warFrequency: "Twice weekly"
        },
        {
            name: "ACADEMY CLAN",
            tag: "#QRSTUVWX",
            role: "academy",
            enabled: false,          // Set to false if you don't have an academy clan
            thLevel: "7-9",
            description: "Learning environment for newer players to develop attack strategies and base building skills.",
            requirements: "TH7+, Active daily, willing to learn and improve",
            warFrequency: "Weekly"
        }
    ],

    // Additional server configuration
    server: {
        defaultColor: '#3498DB', // Default color theme for server
        enableTownHallRoles: true, // Whether to create TH level roles
        enableVerification: true,  // Whether to use verification system
        warReminders: true,        // Whether to use war reminder functionality
        automatedStats: true       // Whether to use automated stats tracking
    }
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
function generateRoles() {
    const baseRoles = [
        // Administrative roles
        {
            name: 'Administrator',
            color: Colors.Red,
            hoist: true,
            mentionable: true,
            permissions: [PermissionFlagsBits.Administrator],
            description: "Full server control with all permissions"
        },
        {
            name: 'Leadership',
            color: Colors.Orange,
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.ManageNicknames,
                PermissionFlagsBits.MentionEveryone
            ],
            description: "Clan leadership with moderation capabilities"
        },
        {
            name: 'Applicant',
            color: Colors.Grey,
            hoist: true,
            mentionable: true,
            description: "Potential members awaiting acceptance"
        },

        // Clan position roles
        {
            name: 'Clan Leader',
            color: Colors.Gold,
            hoist: false,
            mentionable: true,
            description: "In-game Leader position"
        },
        {
            name: 'Co-Leader',
            color: Colors.LightGrey,
            hoist: false,
            mentionable: true,
            description: "In-game Co-Leader position"
        },
        {
            name: 'Elder',
            color: Colors.Orange,
            hoist: false,
            mentionable: true,
            description: "In-game Elder position"
        },

        // Special roles
        {
            name: 'War Player',
            color: Colors.DarkRed,
            hoist: false,
            mentionable: true,
            description: "Active war participants"
        },
        {
            name: 'Clan Games MVP',
            color: Colors.Purple,
            hoist: false,
            mentionable: true,
            description: "Top clan games performers"
        },
        {
            name: 'Capital Contributor',
            color: Colors.Blue,
            hoist: false,
            mentionable: true,
            description: "Active Clan Capital contributors"
        },
        {
            name: 'Event Coordinator',
            color: Colors.Green,
            hoist: false,
            mentionable: true,
            description: "Organizes clan events and tournaments"
        },
        {
            name: 'Content Creator',
            color: Colors.Yellow,
            hoist: false,
            mentionable: true,
            description: "Creates guides, videos, and other clan content"
        }
    ];

    // Generate Town Hall roles if enabled
    const townHallRoles = [];
    if (config.server.enableTownHallRoles) {
        for (let i = 15; i >= 8; i--) {
            townHallRoles.push({
                name: `TH${i}`,
                color: i >= 13 ? Colors.Gold : i >= 11 ? Colors.Blue : i >= 9 ? Colors.Green : Colors.Grey,
                hoist: false,
                mentionable: false,
                description: `Town Hall ${i} players`
            });
        }
    }

    // Generate clan roles based on enabled clans
    const roleColors = {
        main: Colors.Blue,
        feeder: Colors.Green,
        academy: Colors.Purple,
        other: Colors.Grey
    };

    const clanRoles = enabledClans.map(clan => ({
        name: clan.name,  // Use clan name as role name
        color: roleColors[clan.role] || Colors.Grey,
        hoist: true,
        mentionable: true,
        description: `Members of ${clan.name} (${clan.tag})`
    }));

    // Combine all roles
    return [...baseRoles, ...clanRoles, ...townHallRoles];
}

// ========= CATEGORY AND CHANNEL STRUCTURE =========
// Define the complete server structure with channel descriptions
function generateServerStructure() {
    // Welcome and Info category
    const welcomeInfoCategory = {
        name: '📢 WELCOME & INFO',
        description: "Server information and welcome content",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
        ],
        channels: [
            {
                name: 'welcome',
                type: ChannelType.GuildText,
                description: "Welcome message and server information",
                topic: `Welcome to ${config.familyName}! Learn about our clan family and how to get started.`
            },
            {
                name: 'rules',
                type: ChannelType.GuildText,
                description: "Server and clan rules",
                topic: "Rules and guidelines for the server and all clans in our family."
            },
            {
                name: 'announcements',
                type: ChannelType.GuildText,
                description: "Important server and clan announcements",
                topic: "Important announcements from leadership. This channel is read-only.",
                customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AddReactions], deny: [PermissionFlagsBits.SendMessages] }
                ]
            },
            {
                name: 'clan-family',
                type: ChannelType.GuildText,
                description: "Overview of all clans in our family",
                topic: "Information about all clans in our family, requirements, and promotions."
            }
        ]
    };

    // Verification category - only if enabled
    const verificationCategory = config.server.enableVerification ? {
        name: '✅ VERIFICATION',
        description: "Account verification for new members",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
        ],
        channels: [
            {
                name: 'verification-info',
                type: ChannelType.GuildText,
                description: "Information about the verification process",
                topic: "How to verify your Clash of Clans account to access the server.",
                customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]
            },
            {
                name: 'verify-here',
                type: ChannelType.GuildText,
                description: "Channel for verifying your account",
                topic: "Use the /link command with your player tag to verify your account."
            }
        ]
    } : null;

    // Bot Commands category
    const botCommandsCategory = {
        name: '🤖 BOT COMMANDS',
        description: "Channels for interacting with the bot",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
        ],
        channels: [
            {
                name: 'bot-commands',
                type: ChannelType.GuildText,
                description: "General bot commands",
                topic: "Use this channel for general bot commands and queries."
            },
            {
                name: 'player-lookup',
                type: ChannelType.GuildText,
                description: "Look up player statistics",
                topic: "Use /player commands to look up player statistics and information."
            },
            {
                name: 'family-dashboard',
                type: ChannelType.GuildText,
                description: "Overview of clan family statistics",
                topic: "Automated dashboard showing clan family statistics and performance.",
                customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
                    { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            },
            {
                name: 'stats-tracking',
                type: ChannelType.GuildText,
                description: "Player progress and statistics tracking",
                topic: "Track your CoC progress, donations, and activity metrics over time.",
                customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]
            }
        ]
    };

    // Generate clan categories based on enabled clans
    const clanCategories = enabledClans.map(clan => {
        const emojiPrefix = clan.role === 'main' ? '🏆 ' : clan.role === 'feeder' ? '🔄 ' : clan.role === 'academy' ? '🎓 ' : '🏰 ';

        return {
            name: `${emojiPrefix}${clan.name} [${clan.tag}]`,
            description: clan.description,
            permissions: [
                { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
                { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
                { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: clan.name, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
            ],
            channels: [
                {
                    name: 'clan-info',
                    type: ChannelType.GuildText,
                    description: "Information about this clan",
                    topic: `Detailed information about ${clan.name} (${clan.tag}), requirements, and rules.`,
                    customPermissions: [
                        { id: clan.name, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                    ]
                },
                {
                    name: 'announcements',
                    type: ChannelType.GuildText,
                    description: "Clan-specific announcements",
                    topic: `Important announcements for ${clan.name} members only.`,
                    customPermissions: [
                        { id: clan.name, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
                        { id: 'Clan Leader', allow: [PermissionFlagsBits.SendMessages] },
                        { id: 'Co-Leader', allow: [PermissionFlagsBits.SendMessages] }
                    ]
                },
                {
                    name: 'war-status',
                    type: ChannelType.GuildText,
                    description: "Current war status and information",
                    topic: `Automated war status updates and information for ${clan.name}.`,
                    customPermissions: [
                        { id: clan.name, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                    ]
                },
                {
                    name: 'war-planning',
                    type: ChannelType.GuildText,
                    description: "War strategy and planning",
                    topic: `Plan war attacks, discuss strategies, and coordinate for ${clan.name} wars.`
                },
                {
                    name: 'general-chat',
                    type: ChannelType.GuildText,
                    description: "General clan discussion",
                    topic: `General chat for ${clan.name} members.`
                },
                {
                    name: 'base-sharing',
                    type: ChannelType.GuildText,
                    description: "Share and discuss base layouts",
                    topic: `Share your base designs and get feedback from other ${clan.name} members.`
                },
                {
                    name: 'attack-strats',
                    type: ChannelType.GuildText,
                    description: "Attack strategy discussion",
                    topic: `Discuss attack strategies, army compositions, and practice results for ${clan.name}.`
                }
            ]
        };
    });

    // Clan Events category
    const clanEventsCategory = {
        name: '🎮 CLAN EVENTS',
        description: "Clan-wide events and activities",
        permissions: [
            { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Event Coordinator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            {
                name: 'clan-games',
                type: ChannelType.GuildText,
                description: "Clan Games coordination and progress",
                topic: "Coordinate Clan Games participation, track progress, and discuss challenges."
            },
            {
                name: 'cwl-planning',
                type: ChannelType.GuildText,
                description: "Clan War League planning and rosters",
                topic: "Plan Clan War League rosters, strategies, and coordination across all clans."
            },
            {
                name: 'capital-raids',
                type: ChannelType.GuildText,
                description: "Clan Capital raids and contributions",
                topic: "Coordinate Clan Capital raids, track contributions, and discuss district upgrades."
            },
            {
                name: 'achievements',
                type: ChannelType.GuildText,
                description: "Member achievements and celebrations",
                topic: "Celebrate member achievements, promotions, and milestones."
            },
            {
                name: 'tournaments',
                type: ChannelType.GuildText,
                description: "Family tournaments and competitions",
                topic: "Internal family tournaments, friendly competitions, and events."
            }
        ],
        // Add permissions for each enabled clan
        dynamicPermissions: true
    };

    // Resources category
    const resourcesCategory = {
        name: '📚 RESOURCES & GUIDES',
        description: "CoC guides, resources, and helpful content",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Content Creator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ],
        channels: [
            {
                name: 'attack-guides',
                type: ChannelType.GuildText,
                description: "Attack strategy guides",
                topic: "Comprehensive guides for various attack strategies at different Town Hall levels."
            },
            {
                name: 'base-designs',
                type: ChannelType.GuildText,
                description: "Base design guides and links",
                topic: "Base design theory, recommended layouts, and base building guides."
            },
            {
                name: 'upgrade-guides',
                type: ChannelType.GuildText,
                description: "Upgrade priority guides",
                topic: "Guides for efficient upgrade paths for each Town Hall level."
            },
            {
                name: 'useful-links',
                type: ChannelType.GuildText,
                description: "Useful CoC tools and websites",
                topic: "Collection of useful websites, tools, and resources for Clash of Clans."
            }
        ]
    };

    // Community category
    const communityCategory = {
        name: '💬 COMMUNITY',
        description: "General community discussion channels",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ],
        channels: [
            {
                name: 'general-chat',
                type: ChannelType.GuildText,
                description: "General discussion for all members",
                topic: "General chat for all family members, regardless of clan."
            },
            {
                name: 'clash-discussion',
                type: ChannelType.GuildText,
                description: "Clash of Clans game discussion",
                topic: "Discuss Clash of Clans updates, meta changes, and general game topics."
            },
            {
                name: 'memes-and-fun',
                type: ChannelType.GuildText,
                description: "Memes and fun content",
                topic: "Share memes, funny moments, and entertaining content related to Clash of Clans."
            },
            {
                name: 'off-topic',
                type: ChannelType.GuildText,
                description: "Non-CoC discussion",
                topic: "Discussions about topics other than Clash of Clans."
            }
        ]
    };

    // Recruitment category
    const recruitmentCategory = {
        name: '📥 RECRUITMENT',
        description: "Clan recruitment and applications",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Applicant', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            {
                name: 'join-our-clans',
                type: ChannelType.GuildText,
                description: "Information about joining our clans",
                topic: "Information about all clans in our family, requirements, and how to join.",
                customPermissions: [
                    { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }
                ]
            },
            {
                name: 'applications',
                type: ChannelType.GuildText,
                description: "Apply to join our clans",
                topic: "Submit your application to join one of our clans."
            },
            {
                name: 'interview-queue',
                type: ChannelType.GuildText,
                description: "Queue for leadership interviews",
                topic: "Waiting area for applicant interviews with leadership.",
                customPermissions: [
                    { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
                    { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: 'Applicant', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            }
        ]
    };

    // Leadership category
    const leadershipCategory = {
        name: '👑 LEADERSHIP',
        description: "Leadership discussion and management",
        permissions: [
            { id: 'everyone', deny: [PermissionFlagsBits.ViewChannel] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Bot', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
        ],
        channels: [
            {
                name: 'leadership-chat',
                type: ChannelType.GuildText,
                description: "General leadership discussion",
                topic: "General discussion channel for all leadership members."
            },
            {
                name: 'decisions',
                type: ChannelType.GuildText,
                description: "Decision making and policy changes",
                topic: "Discuss and record important decisions about the clan family."
            },
            {
                name: 'bot-management',
                type: ChannelType.GuildText,
                description: "Bot configuration and management",
                topic: "Configure and manage the Discord bot for the server."
            },
            {
                name: 'member-notes',
                type: ChannelType.GuildText,
                description: "Notes on members and applicants",
                topic: "Keep track of member behavior, warnings, and notes."
            },
            {
                name: 'war-performance',
                type: ChannelType.GuildText,
                description: "War performance tracking",
                topic: "Track and discuss member war performance across all clans."
            }
        ]
    };

    // Voice channels category
    const voiceCategory = {
        name: '🔊 VOICE CHANNELS',
        description: "Voice communication channels",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] }
        ],
        channels: [
            {
                name: 'General Lounge',
                type: ChannelType.GuildVoice,
                description: "General voice chat for everyone"
            },
            {
                name: 'War Planning',
                type: ChannelType.GuildVoice,
                description: "Coordinate war attacks"
            },
            {
                name: 'Leadership Meeting',
                type: ChannelType.GuildVoice,
                description: "Voice channel for leadership",
                customPermissions: [
                    { id: 'everyone', deny: [PermissionFlagsBits.Connect] },
                    { id: 'Leadership', allow: [PermissionFlagsBits.Connect] }
                ]
            }
        ],
        // Add voice channels for each enabled clan
        dynamicChannels: true
    };

    // Build and return the complete category structure
    let categories = [
        welcomeInfoCategory,
        botCommandsCategory,
        recruitmentCategory,
        communityCategory,
        resourcesCategory,
        leadershipCategory,
        voiceCategory,
        clanEventsCategory
    ];

    // Add verification category if enabled
    if (verificationCategory) {
        categories.splice(1, 0, verificationCategory);
    }

    // Add individual clan categories
    categories = [...categories, ...clanCategories];

    // Process dynamic permissions and channels
    categories = categories.map(category => {
        // Skip null categories
        if (!category) return null;

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

        if (category.dynamicChannels && category.name === '🔊 VOICE CHANNELS') {
            const clanVoiceChannels = enabledClans.map(clan => ({
                name: `${clan.name} Voice`,
                type: ChannelType.GuildVoice,
                description: `Voice channel for ${clan.name} members`,
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
    }).filter(Boolean); // Remove null categories

    return categories;
}

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
    // Get roles list
    const roles = generateRoles();

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
    // Get server structure
    const categories = generateServerStructure();

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
                // Removed the topic property for categories
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

                // Create the channel with topic/description
                const channelOptions = {
                    name: channel.name,
                    type: channel.type,
                    parent: newCategory,
                    permissionOverwrites: channelOverwrites
                };

                // Add topic for text channels
                if (channel.type === ChannelType.GuildText) {
                    channelOptions.topic = channel.topic || channel.description || '';
                }

                const newChannel = await guild.channels.create(channelOptions);

                // Create webhook if needed (for notification channels)
                if (['war-status', 'announcements', 'achievements', 'clan-games', 'capital-raids'].includes(channel.name)) {
                    try {
                        // Determine a relevant name for the webhook based on channel
                        let webhookName = `${channel.name.charAt(0).toUpperCase() + channel.name.slice(1).replace(/-/g, ' ')} Bot`;

                        // For clan-specific channels, include clan name
                        if (newChannel.parent && enabledClans.some(clan => newChannel.parent.name.includes(clan.name))) {
                            const clanName = enabledClans.find(clan => newChannel.parent.name.includes(clan.name))?.name;
                            if (clanName) {
                                webhookName = `${clanName} ${webhookName}`;
                            }
                        }

                        const webhook = await newChannel.createWebhook({
                            name: webhookName,
                            reason: 'Automated notifications'
                        });
                        console.log(`Created webhook for ${channel.name}: ${webhook.url}`);

                        // Save webhook URL to a file for reference
                        const webhooksFile = path.join(__dirname, 'webhooks.txt');
                        fs.appendFileSync(webhooksFile, `${newChannel.parent?.name || 'Unknown'} - ${channel.name}: ${webhook.url}\n`);
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

${config.familyDescription}

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

1. **Link your account**: Use \`/link [YOUR PLAYER TAG]\` in the verification channel
2. **Get your clan role**: An admin will assign you to your clan's role
3. **Explore your clan channels**: Each clan has its own channels under categories

## Server Navigation

• 📢 **WELCOME & INFO** - Server information and announcements
• 🤖 **BOT COMMANDS** - Commands for our Clash of Clans bot
• 📥 **RECRUITMENT** - Join our clans or recruit new members
• 💬 **COMMUNITY** - General discussion for all members
• 📚 **RESOURCES & GUIDES** - Helpful guides and resources
• 🎮 **CLAN EVENTS** - Clan Games, CWL, and special events
• 🔊 **VOICE CHANNELS** - Voice chat for coordination and fun

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
1. **Respect all members** - No harassment, hate speech, or bullying
2. **Keep content appropriate** - No NSFW content or inappropriate language
3. **No spamming** - Avoid excessive messaging, emoji spam, or mention spam
4. **Use channels appropriately** - Post content in the correct channels
5. **Follow Discord's Terms of Service** - https://discord.com/terms

## Clan Participation
1. **Link your account** - Use the bot to verify your Clash of Clans account
2. **Meet requirements** - Maintain the minimum requirements for your assigned clan
3. **Use war attacks** - If opted in for war, use all attacks and follow assignments
4. **Participate in events** - Join in Clan Games, Capital Raids, and CWL
5. **Donate properly** - Donate what is requested and maintain reasonable ratios

## Bot Usage
1. **Use bot channels** - Keep bot commands in designated channels
2. **No command spam** - Avoid repeatedly using commands
3. **Report issues** - Let leadership know if you encounter bot problems
4. **Follow notifications** - Respond to automated reminders for war attacks

## Clan Family Structure
1. **Proper placement** - Accept assignment to appropriate clan based on TH/skill
2. **Request transfers** - Get approval before moving between family clans
3. **Respect hierarchy** - Follow direction from Leaders and Co-Leaders
4. **Help others** - Support fellow clan family members with advice and donations

## Discord Activity
1. **Stay organized** - Use the right channels for different discussions
2. **Use threads** - Create threads for extended conversations when appropriate
3. **Check announcements** - Regularly review important updates
4. **Voice chat etiquette** - Be respectful in voice channels, use push-to-talk

## Consequences for Rule Violations
• **First offense**: Warning from leadership
• **Second offense**: Temporary role restrictions
• **Third offense**: Kick from Discord server/clan
• **Severe violations**: Immediate ban without warning

By participating in this server, you agree to follow these rules. Leadership reserves the right to moderate at their discretion.`;

        await rulesChannel.send(rulesMessage);
        console.log('Posted rules message');

        // Find clan-family channel
        const clanFamilyChannel = guild.channels.cache.find(ch => ch.name === 'clan-family');
        if (clanFamilyChannel) {
            const clanFamilyMessage = `# Our Clan Family Structure

${config.familyDescription}

## Clan Information

${enabledClans.map(clan => `
### ${clan.name} (${clan.tag})

**Description**: ${clan.description}
**Requirements**: ${clan.requirements}
**War Frequency**: ${clan.warFrequency}
**Town Hall Levels**: ${clan.thLevel}

---
`).join('\n')}

## Promotion Structure

Our clan family follows a structured promotion system:

**Member** → **Elder** → **Co-Leader** → **Leader**

• **Elder**: Achieved after consistent activity, donations, and war participation (typically 2-4 weeks)
• **Co-Leader**: By invitation only after significant contribution to the clan (typically 2-3 months as Elder)
• **Leader**: Selected from long-standing Co-Leaders with exceptional leadership qualities

## Moving Between Clans

Members may move between our family clans based on:

1. Town Hall progression
2. Skill development
3. Personal preference (if requirements are met)

To request a move, please speak with leadership in your current clan first.`;

            await clanFamilyChannel.send(clanFamilyMessage);
            console.log('Posted clan family information');
        }

        // Find verification channel if enabled
        if (config.server.enableVerification) {
            const verificationInfoChannel = guild.channels.cache.find(ch => ch.name === 'verification-info');
            if (verificationInfoChannel) {
                const verificationMessage = `# Account Verification Process

Before accessing clan-specific channels, you must verify your Clash of Clans account using our bot.

## Why Verify?
• Confirms you're a real clan member
• Grants access to clan-specific channels
• Enables stat tracking and personalized features
• Protects our clans from spies and unauthorized access

## How to Verify

1. **Find your Player Tag in CoC**
   - Open Clash of Clans
   - Go to your profile
   - Your tag is displayed at the top (starts with #)

2. **Link Your Account**
   - Go to the #verify-here channel
   - Type: \`/link [YOUR PLAYER TAG]\`
   - Example: \`/link #ABC123XYZ\`

3. **Automatic Verification**
   - The bot will check if you're a member of one of our clans
   - If verified, you'll automatically receive your clan role
   - This process is instant if you're already in one of our clans

## Not in a Clan Yet?

If you're not yet a member of one of our clans:

1. Type \`/clan\` to see our clan information
2. Go to #applications channel to apply
3. A leader will review your profile and help you join

## Need Help?

If you're having trouble with verification:

1. Double-check your player tag for typos
2. Make sure you're in one of our clans in-game
3. Tag @Leadership for assistance

*Note: You only need to verify once, even if you move between our family clans.*`;

                await verificationInfoChannel.send(verificationMessage);
                console.log('Posted verification information');
            }
        }

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

            const infoMessage = `# ${clan.name} - Clan Information

## 🏆 About Us

**Clan Tag**: ${clan.tag}
**Role in Family**: ${clan.role.charAt(0).toUpperCase() + clan.role.slice(1)}
**Description**: ${clan.description}
**War Frequency**: ${clan.warFrequency}

## ⚔️ Requirements

• **Town Hall**: TH ${clan.thLevel}
• **Heroes**: ${clan.requirements}
• **War Stars**: Active war participation expected
• **Donations**: Request and donate regularly
• **Activity**: Daily activity expected

## 📊 Expectations

• **War**: Use both attacks in regular wars if opted in
• **Clan Games**: Minimum 1000 points per season 
• **Capital Contributions**: Weekly participation expected
• **Donations**: Maintain at least a 1:3 donation ratio
• **Communication**: Check Discord regularly for announcements

## 🚨 Rules

1. Follow war plans and attack assignments
2. Donate what is requested when possible
3. Be respectful to all members
4. Notify leadership if you'll be inactive for more than 3 days
5. Complete clan games tasks before starting new ones

## ⬆️ Promotion Path

• **Elder**: Achieved after 2-4 weeks of consistent activity and war participation
• **Co-Leader**: By invitation only after significant contribution (typically 2+ months as Elder)
• **Leader**: Selected from trusted Co-Leaders with exceptional leadership skills

## 🔎 Performance Review

Inactive or underperforming members may be:
1. Given a warning
2. Demoted
3. Moved to another family clan
4. Removed if issues persist

## 🔄 How to Join

1. Apply in-game with the message "From Discord"
2. Use \`/clan\` in #bot-commands to view current clan status
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

**Role**: ${clan.role.charAt(0).toUpperCase() + clan.role.slice(1)} Clan
**Description**: ${clan.description}
**Requirements**: 
• Town Hall: TH${clan.thLevel}
• ${clan.requirements}
• War Frequency: ${clan.warFrequency}

**How to Join**: Apply in-game with the message "From Discord" or apply below in #applications
`;
            }).join('\n');

            const recruitmentMessage = `# Join Our Clan Family

Looking for a new clan? We have several options depending on your Town Hall level and play style!

${recruitmentText}

## Application Process

1. **Choose a clan** that matches your Town Hall level and playstyle
2. **Go to the #applications channel** and provide:
   - Your player tag
   - Which clan you want to join
   - Your Town Hall level
   - A brief introduction about your play style
3. **Wait for review** - A leader will review your profile and help you get set up
4. **Verification** - Once accepted, you'll need to verify your account using \`/link\`

## Alternative Method

You can also apply directly in-game:

1. Search for the clan tag
2. Send a join request mentioning "From Discord"
3. Come back here and let us know you've applied

## What We Look For

* Active players who participate in clan events
* Team players who follow war strategies
* Friendly members who contribute to the community
* Players focused on improvement and learning

Questions? Tag @Leadership for assistance.`;

            await recruitmentChannel.send(recruitmentMessage);
            console.log('Posted recruitment message');
        }

        // Find attack-guides channel
        const attackGuidesChannel = guild.channels.cache.find(ch => ch.name === 'attack-guides');
        if (attackGuidesChannel) {
            const attackGuidesMessage = `# Attack Strategy Guides

This channel contains comprehensive guides for various attack strategies at different Town Hall levels. These guides are meant to help you improve your attacking skills in war and multiplayer battles.

## How to Use This Channel

* Guides are organized by Town Hall level
* Each strategy includes army compositions, spell combinations, and deployment techniques
* Videos and image examples are included when available
* Ask questions about specific strategies in the #clash-discussion channel

## Contributing

If you'd like to contribute a strategy guide:

1. Contact a @Content Creator or @Leadership member
2. Provide a detailed breakdown of the strategy
3. Include example attacks if possible

## Strategy Index

*Leadership will pin important strategies for each Town Hall level here.*

### General Attacking Tips

* Scout your target thoroughly before attacking
* Understand the purpose of each troop in your army composition
* Practice strategies in Friendly Challenges before using them in war
* Watch for clan castle troops and key defensive structures
* Time is often as important as troop placement

### Finding More Resources

* YouTube channels like [ClashWithEric, Judo Sloth, CarbonFin]
* Clash of Clans wiki for troop statistics
* In-game practice maps
* Friendly challenges with clanmates`;

            await attackGuidesChannel.send(attackGuidesMessage);
            console.log('Posted attack guides template');
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
        console.log(`Family Description: ${config.familyDescription}`);
        console.log('Enabled Clans:');
        enabledClans.forEach((clan, index) => {
            console.log(`  ${index + 1}. ${clan.name} (${clan.tag}) - ${clan.role} - TH${clan.thLevel}`);
            console.log(`     ${clan.description}`);
        });

        // Confirm with the user
        rl.question(`\nThis will DELETE ALL existing channels, categories, and roles in ${guild.name}, then create a sophisticated structure for your ${enabledClans.length} clan(s). This action cannot be undone. Continue? (yes/no): `, async (answer) => {
            if (answer.toLowerCase() !== 'yes') {
                console.log('Setup cancelled.');
                rl.close();
                process.exit(0);
                return;
            }

            console.log('\nStarting server cleanup and setup...');
            console.log('This process will take several minutes to complete.\n');

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

            console.log('\n✅ Server setup completed successfully!');
            console.log(`\nCompleted Setup:`);
            console.log(`Roles created: ${Object.keys(createdRoles).length} roles`);
            console.log(`Clan areas created: ${enabledClans.length} clan sections`);
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