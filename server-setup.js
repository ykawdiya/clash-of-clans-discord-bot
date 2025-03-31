// Enhanced Discord Server Setup Script for Clash of Clans Bot
// - Community-focused with friendly chat areas and interest groups
// - Optimized for clan management without recruitment features

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
    familyName: "CHAT!",
    familyDescription: "A friendly community of Clash of Clans players focused on growth, strategy and having fun",
    serverIconURL: "", // Optional: URL to an image for server icon

    // Clan configuration - set enabled: false for clans you don't want to use
    clans: [
        {
            name: "Chatterbox",
            tag: "#2RUVGR2QQ",
            role: "main",
            enabled: true,           // Always keep your main clan enabled
            thLevel: "11+",
            description: "Our main clan focused on war, progress and having fun!",
            requirements: "TH11+",
            warFrequency: "Constant"
        },
        {
            name: "FEEDER CLAN",
            tag: "#IJKLMNOP",
            role: "feeder",
            enabled: false,           // Set to false if you don't have a feeder clan
            thLevel: "10-12",
            description: "Development clan for TH10-12 players looking to improve war skills.",
            requirements: "TH10+",
            warFrequency: "Twice weekly"
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
        },

        // Interest group roles
        {
            name: 'Food Enthusiast',
            color: Colors.Red,
            hoist: false,
            mentionable: true,
            description: "For members interested in sharing recipes and food discussions"
        },
        {
            name: 'Game Nights',
            color: Colors.Purple,
            hoist: false,
            mentionable: true,
            description: "Interested in clan game nights and other activities"
        },
        {
            name: 'Strategy Master',
            color: Colors.Blue,
            hoist: false,
            mentionable: true,
            description: "For members who focus on attack strategies and base designs"
        }
    ];

    // Generate Town Hall roles if enabled
    const townHallRoles = [];
    if (config.server.enableTownHallRoles) {
        for (let i = 16; i >= 8; i--) {
            townHallRoles.push({
                name: `TH${i}`,
                color: i >= 14 ? Colors.Gold : i >= 12 ? Colors.Blue : i >= 10 ? Colors.Green : Colors.Grey,
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
                topic: "Information about all clans in our family."
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
                }
            ]
        };
    });

    // Clan Events category
    const clanEventsCategory = {
        name: '🎮 CLAN EVENTS',
        description: "Clan-wide events and activities",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
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
                name: 'game-nights',
                type: ChannelType.GuildText,
                description: "Organize game nights and other activities",
                topic: "Plan and coordinate fun gaming sessions beyond just Clash of Clans!"
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
            { id: 'Strategy Master', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
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

    // Community category - Enhanced for friendly chit-chat
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
                topic: "General chat for all members - come say hi and get to know each other!"
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
                name: 'introductions',
                type: ChannelType.GuildText,
                description: "Introduce yourself to the community",
                topic: "New to the server? Tell us a bit about yourself, your clash history, and your hobbies!"
            },
            {
                name: 'off-topic',
                type: ChannelType.GuildText,
                description: "Non-CoC discussion",
                topic: "Chat about anything not related to Clash of Clans - movies, sports, tech, etc."
            }
        ]
    };

    // Member Interest Groups category - NEW
    const interestGroupsCategory = {
        name: '🌟 MEMBER INTERESTS',
        description: "Channels for sharing interests beyond Clash of Clans",
        permissions: [
            { id: 'everyone', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: 'Administrator', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
            { id: 'Leadership', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
        ],
        channels: [
            {
                name: 'food-recipes',
                type: ChannelType.GuildText,
                description: "Share your favorite recipes and food",
                topic: "Share recipes, cooking tips, food photos, and restaurant recommendations!",
                customPermissions: [
                    { id: 'Food Enthusiast', allow: [PermissionFlagsBits.ManageMessages] }
                ]
            },
            {
                name: 'gaming-lounge',
                type: ChannelType.GuildText,
                description: "Chat about other games",
                topic: "Discuss other games you play besides Clash of Clans."
            },
            {
                name: 'tech-talk',
                type: ChannelType.GuildText,
                description: "Tech, gadgets, and apps",
                topic: "Talk about technology, mobile devices, apps, and gaming setups."
            },
            {
                name: 'creative-corner',
                type: ChannelType.GuildText,
                description: "Art, music, and creative hobbies",
                topic: "Share your creative projects, artwork, music, and other hobbies."
            },
            {
                name: 'pet-pictures',
                type: ChannelType.GuildText,
                description: "Share pictures of your pets",
                topic: "Show off your furry, feathery, or scaly friends!"
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
                description: "Notes on members",
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
                name: 'Game Night',
                type: ChannelType.GuildVoice,
                description: "For game nights and other activities"
            },
            {
                name: 'Chill Zone',
                type: ChannelType.GuildVoice,
                description: "Relaxed conversation space"
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
        communityCategory,
        interestGroupsCategory,  // New category for member interests
        resourcesCategory,
        clanEventsCategory,
        leadershipCategory,
        voiceCategory
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

We're excited to have you join our Clash of Clans family! This server is the central hub for all members across our clan family and a friendly community to chat, share, and have fun.

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

## Getting Involved

• **Join our voice chats** for war planning, game nights, or just hanging out
• **Share your interests** in our member interest channels
• **Participate in events** like Clan Games, CWL, and game nights
• **Post your favorite recipes** in #food-recipes
• **Share your pet photos** in #pet-pictures

## How to Get Set Up

1. **Link your account**: Use \`/link [YOUR PLAYER TAG]\` in the verification channel
2. **Introduce yourself**: Tell us a bit about yourself in #introductions
3. **Explore the server**: Check out all the channels and find your interests

Need help? Tag @Leadership and we'll be happy to assist!`;

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
1. **Be respectful to all members** - No harassment, hate speech, or bullying
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

## Community Engagement
1. **Introduce yourself** - Post a brief introduction in the #introductions channel
2. **Share your interests** - Participate in member interest channels
3. **Be supportive** - Offer help and encouragement to fellow members
4. **Respect privacy** - Don't share others' personal information

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
• Unlocks additional server features

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

## Already in a Clan?

After verifying:
1. Introduce yourself in #introductions
2. Check out the various interest channels
3. Join the voice chat to say hello!

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

        // Add food-recipes channel starter message
        const foodRecipesChannel = guild.channels.cache.find(ch => ch.name === 'food-recipes');
        if (foodRecipesChannel) {
            const foodRecipesMessage = `# Welcome to Food & Recipes! 🍳

This channel is dedicated to sharing your favorite recipes, cooking tips, food photos, and culinary adventures!

## Posting Guidelines:
- Share recipes with ingredients, instructions, and a photo if possible
- Feel free to ask for cooking advice or recipe recommendations
- Food photos are welcome - show off your creations!
- Restaurant recommendations are encouraged

## Recipe Format Suggestion:
\`\`\`
# Recipe Name
## Ingredients:
- Item 1
- Item 2
- Item 3

## Instructions:
1. Step one
2. Step two
3. Step three

## Tips:
Any special tips or substitutions
\`\`\`

## Get Started:
Reply to this message with your favorite recipe or dish to share with the community!

*Get the "Food Enthusiast" role by asking Leadership if you're passionate about sharing recipes!*`;

            await foodRecipesChannel.send(foodRecipesMessage);
            console.log('Posted food recipes starter message');
        }

        // Add introductions channel starter message
        const introductionsChannel = guild.channels.cache.find(ch => ch.name === 'introductions');
        if (introductionsChannel) {
            const introductionsMessage = `# Welcome to Introductions! 👋

This is the place to introduce yourself to our community! We'd love to get to know you better.

## Introduction Format Suggestion:
\`\`\`
# Hello, I'm [Name/Nickname]!

## About Me:
- Where I'm from
- How long I've been playing Clash of Clans
- My Town Hall level and favorite attack strategy

## Outside of Clash:
- Hobbies and interests
- Favorite games besides CoC
- Something interesting about me

## Looking forward to:
What you're excited about in the clan/community
\`\`\`

Feel free to share as much or as little as you're comfortable with. We're just happy to have you here!

**Leadership and existing members:** Please welcome new members and help them feel at home!`;

            await introductionsChannel.send(introductionsMessage);
            console.log('Posted introductions starter message');
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

## 🔄 Moving Up

As you progress in Town Hall level and improve your skills, you may be eligible to move between clans in our family. Speak with leadership about advancement opportunities.

Last Updated: ${new Date().toLocaleDateString()}`;

            await clanInfoChannel.send(infoMessage);
            console.log(`Posted clan info for ${clan.name}`);
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
        rl.question(`\nThis will DELETE ALL existing channels, categories, and roles in ${guild.name}, then create a comprehensive structure for your ${enabledClans.length} clan(s). This action cannot be undone. Continue? (yes/no): `, async (answer) => {
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