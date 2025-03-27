// src/utils/configManager.js

/**
 * Configuration manager for server templates and other settings
 */
class ConfigManager {
    constructor() {
        this.serverTemplates = {
            // Standard clan template with basic structure
            standard: {
                name: 'Standard Clan',
                description: 'Basic structure with general, announcement, and war channels',
                categories: [
                    {
                        name: '📢 CLAN HALL',
                        channels: [
                            { name: 'welcome', type: 'text', description: 'Welcome new members' },
                            { name: 'rules', type: 'text', description: 'Clan rules and guidelines' },
                            { name: 'announcements', type: 'text', description: 'Important clan announcements' },
                            { name: 'introductions', type: 'text', description: 'Introduce yourself to the clan' }
                        ]
                    },
                    {
                        name: '💬 GENERAL',
                        channels: [
                            { name: 'general', type: 'text', description: 'General chat for clan members' },
                            { name: 'base-sharing', type: 'text', description: 'Share your base designs' },
                            { name: 'attack-strategy', type: 'text', description: 'Discuss attack strategies' },
                            { name: 'bot-commands', type: 'text', description: 'Use bot commands here' },
                            { name: 'general-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '⚔️ WAR ROOM',
                        channels: [
                            { name: 'war-announcements', type: 'text', description: 'War start/end announcements' },
                            { name: 'war-planning', type: 'text', description: 'Plan war attacks here' },
                            { name: 'war-results', type: 'text', description: 'War results and stats' },
                            { name: 'cwl-discussion', type: 'text', description: 'Clan War League discussions' },
                            { name: 'war-meeting', type: 'voice' }
                        ]
                    }
                ]
            },

            // Competitive template focused on war and tournaments
            competitive: {
                name: 'Competitive Clan',
                description: 'Focus on war strategy, CWL, and tournament organization',
                categories: [
                    {
                        name: '📢 CLAN INFO',
                        channels: [
                            { name: 'welcome', type: 'text', description: 'Welcome new members' },
                            { name: 'rules', type: 'text', description: 'Clan rules and guidelines' },
                            { name: 'announcements', type: 'text', description: 'Important clan announcements' },
                            { name: 'clan-stats', type: 'text', description: 'Clan statistics and tracking' }
                        ]
                    },
                    {
                        name: '💬 GENERAL',
                        channels: [
                            { name: 'general', type: 'text', description: 'General chat for clan members' },
                            { name: 'bot-commands', type: 'text', description: 'Use bot commands here' },
                            { name: 'general-voice', type: 'voice' },
                            { name: 'music-bot', type: 'voice' }
                        ]
                    },
                    {
                        name: '⚔️ WAR PLANNING',
                        channels: [
                            { name: 'war-announcements', type: 'text', description: 'War start/end announcements' },
                            { name: 'attack-assignments', type: 'text', description: 'War attack assignments' },
                            { name: 'war-planning', type: 'text', description: 'Plan war attacks here' },
                            { name: 'base-analysis', type: 'text', description: 'Analyze enemy bases' },
                            { name: 'war-meeting', type: 'voice' }
                        ]
                    },
                    {
                        name: '🏆 CWL & TOURNAMENTS',
                        channels: [
                            { name: 'cwl-planning', type: 'text', description: 'CWL planning and strategy' },
                            { name: 'cwl-results', type: 'text', description: 'CWL results and standings' },
                            { name: 'tournaments', type: 'text', description: 'Tournament information' },
                            { name: 'competitive-team', type: 'text', description: 'Competitive team chat' },
                            { name: 'strategy-meeting', type: 'voice' }
                        ]
                    },
                    {
                        name: '📊 STATS & ANALYTICS',
                        channels: [
                            { name: 'performance-tracking', type: 'text', description: 'Track player performance' },
                            { name: 'attack-analysis', type: 'text', description: 'Analyze attack replays' },
                            { name: 'strategies-library', type: 'text', description: 'Share battle strategies' }
                        ]
                    }
                ]
            },

            // Community-focused template with more social channels
            community: {
                name: 'Community Clan',
                description: 'More social channels and discussion areas',
                categories: [
                    {
                        name: '📢 WELCOME',
                        channels: [
                            { name: 'welcome', type: 'text', description: 'Welcome new members' },
                            { name: 'rules', type: 'text', description: 'Community rules and guidelines' },
                            { name: 'announcements', type: 'text', description: 'Important announcements' },
                            { name: 'introductions', type: 'text', description: 'Introduce yourself to the community' }
                        ]
                    },
                    {
                        name: '💬 CHAT',
                        channels: [
                            { name: 'general', type: 'text', description: 'General chat for everyone' },
                            { name: 'memes', type: 'text', description: 'Share your memes' },
                            { name: 'off-topic', type: 'text', description: 'Off-topic discussions' },
                            { name: 'bot-commands', type: 'text', description: 'Use bot commands here' },
                            { name: 'general-voice', type: 'voice' },
                            { name: 'chill-lounge', type: 'voice' }
                        ]
                    },
                    {
                        name: '⚔️ CLASH OF CLANS',
                        channels: [
                            { name: 'clash-general', type: 'text', description: 'General CoC discussion' },
                            { name: 'base-sharing', type: 'text', description: 'Share your base designs' },
                            { name: 'attack-strategy', type: 'text', description: 'Discuss attack strategies' },
                            { name: 'clan-war', type: 'text', description: 'War discussions' },
                            { name: 'war-planning', type: 'voice' }
                        ]
                    },
                    {
                        name: '🎮 GAMING',
                        channels: [
                            { name: 'games-discussion', type: 'text', description: 'Discuss other games' },
                            { name: 'supercell-games', type: 'text', description: 'Other Supercell games' },
                            { name: 'gaming-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '🎉 EVENTS',
                        channels: [
                            { name: 'events', type: 'text', description: 'Community events and activities' },
                            { name: 'giveaways', type: 'text', description: 'Giveaways and contests' },
                            { name: 'event-voice', type: 'voice' }
                        ]
                    }
                ]
            },

            // Clan family template for multiple clans
            family: {
                name: 'Clan Family',
                description: 'For clans with multiple sub-clans or feeder clans',
                categories: [
                    {
                        name: '📢 FAMILY INFO',
                        channels: [
                            { name: 'welcome', type: 'text', description: 'Welcome to our clan family' },
                            { name: 'rules', type: 'text', description: 'Family rules and guidelines' },
                            { name: 'announcements', type: 'text', description: 'Important family announcements' },
                            { name: 'introductions', type: 'text', description: 'Introduce yourself' }
                        ]
                    },
                    {
                        name: '💬 GENERAL',
                        channels: [
                            { name: 'general', type: 'text', description: 'General chat for everyone' },
                            { name: 'bot-commands', type: 'text', description: 'Use bot commands here' },
                            { name: 'general-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '🔴 MAIN CLAN',
                        channels: [
                            { name: 'main-chat', type: 'text', description: 'Main clan chat' },
                            { name: 'main-war', type: 'text', description: 'Main clan war planning' },
                            { name: 'main-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '🔵 FEEDER CLAN',
                        channels: [
                            { name: 'feeder-chat', type: 'text', description: 'Feeder clan chat' },
                            { name: 'feeder-war', type: 'text', description: 'Feeder clan war planning' },
                            { name: 'feeder-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '🟢 DEVELOPMENT CLAN',
                        channels: [
                            { name: 'dev-chat', type: 'text', description: 'Development clan chat' },
                            { name: 'dev-war', type: 'text', description: 'Development clan war planning' },
                            { name: 'dev-voice', type: 'voice' }
                        ]
                    },
                    {
                        name: '🌟 LEADERSHIP',
                        channels: [
                            { name: 'leadership-chat', type: 'text', description: 'Leadership discussions' },
                            { name: 'recruitment', type: 'text', description: 'Recruitment planning' },
                            { name: 'leadership-voice', type: 'voice' }
                        ]
                    }
                ]
            }
        };
    }

    /**
     * Get a server template by name
     * @param {string} templateName Name of the template
     * @returns {Object|null} Template object or null if not found
     */
    getServerTemplate(templateName) {
        return this.serverTemplates[templateName] || this.serverTemplates.standard;
    }

    /**
     * Get template name from template ID
     * @param {string} templateId Template ID
     * @returns {string} User-friendly template name
     */
    getTemplateName(templateId) {
        if (this.serverTemplates[templateId]) {
            return this.serverTemplates[templateId].name;
        }
        return 'Custom Template';
    }

    /**
     * Get role name from role type
     * @param {string} roleType Role type ID
     * @returns {string} User-friendly role type name
     */
    getRoleName(roleType) {
        const roleNames = {
            'clan_roles': 'Clan Roles',
            'th_roles': 'Town Hall Roles',
            'war_roles': 'War Roles',
            'special_roles': 'Special Roles'
        };

        return roleNames[roleType] || roleType;
    }

    /**
     * Get permission template name
     * @param {string} permissionType Permission template ID
     * @returns {string} User-friendly permission name
     */
    getPermissionName(permissionType) {
        const permissionNames = {
            'standard': 'Standard Permissions',
            'strict': 'Strict Permissions',
            'open': 'Open Permissions',
            'custom': 'Custom Permissions'
        };

        return permissionNames[permissionType] || permissionType;
    }

    /**
     * Get feature name from feature ID
     * @param {string} featureId Feature ID
     * @returns {string} User-friendly feature name
     */
    getFeatureName(featureId) {
        const featureNames = {
            'war_announcements': 'War Announcements',
            'member_tracking': 'Member Tracking',
            'auto_roles': 'Automatic Roles',
            'welcome_messages': 'Welcome Messages',
            'base_sharing': 'Base Sharing System'
        };

        return featureNames[featureId] || featureId;
    }
}

// Export a singleton instance
module.exports = new ConfigManager();