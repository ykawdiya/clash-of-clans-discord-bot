// Enhanced AutomationService with automatic stats tracking and war history
// src/services/automationService.js

class AutomationService {
    constructor(client) {
        this.client = client;
        this.checkInterval = 10 * 60 * 1000; // 10 minutes
        this.warCheckInterval = null;
        this.statsUpdateInterval = null;
        this.lastWarStates = new Map(); // Store last war states
        this.lastStatsUpdate = new Map(); // Track when stats were last updated

        // CoC-themed channel names for lookups
        this.channelMappings = {
            war: ['war-log', 'war-announcements', 'warAnnouncements'],
            general: ['town-hall', 'clan-announcements', 'general'],
            clanGames: ['clan-games', 'clanGames'],
            stats: ['stats', 'player-stats', 'tracking']
        };

        // Stats update config
        this.statsUpdateFrequency = 6 * 60 * 60 * 1000; // 6 hours
        this.statsUpdateBatchSize = 5; // Process 5 players at a time to avoid rate limits
    }

    // Start all automated checks
    startAutomation() {
        console.log('Starting automation service');
        this.stopAutomation(); // Clear any existing intervals

        // Set new intervals
        this.warCheckInterval = setInterval(() => this.checkWars(), this.checkInterval);

        // Add stats update interval
        this.statsUpdateInterval = setInterval(() => this.updatePlayerStats(), this.statsUpdateFrequency);

        // Run an initial stats update after 1 minute to allow for bot startup
        setTimeout(() => this.updatePlayerStats(), 60000);

        console.log('Automation service started with stats tracking and war history');
    }

    // Stop all automated checks
    stopAutomation() {
        if (this.warCheckInterval) {
            clearInterval(this.warCheckInterval);
            this.warCheckInterval = null;
        }

        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }
    }

    // Automatic player stats update
    async updatePlayerStats() {
        try {
            console.log('Starting automatic player stats update...');

            // Load required models
            const User = require('../models/User');
            const PlayerStats = require('../models/PlayerStats');
            const clashApiService = require('./clashApiService');

            // Get all linked users
            const linkedUsers = await User.find({
                playerTag: { $exists: true, $ne: null },
                "preferences.progressTracking": { $ne: false } // Include users who haven't explicitly disabled tracking
            });

            if (linkedUsers.length === 0) {
                console.log('No linked users found for stats update');
                return;
            }

            console.log(`Found ${linkedUsers.length} linked users for stats update`);

            // Process users in batches to avoid API rate limits
            for (let i = 0; i < linkedUsers.length; i += this.statsUpdateBatchSize) {
                const batch = linkedUsers.slice(i, i + this.statsUpdateBatchSize);

                // Process each user in the batch with a small delay between each
                for (const user of batch) {
                    try {
                        // Skip if updated recently (last 4 hours)
                        const lastUpdate = this.lastStatsUpdate.get(user.playerTag);
                        const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);

                        if (lastUpdate && lastUpdate > fourHoursAgo) {
                            console.log(`Skipping recent update for ${user.playerTag}`);
                            continue;
                        }

                        // Get player data from API
                        const playerData = await clashApiService.getPlayer(user.playerTag);

                        if (!playerData) {
                            console.log(`No data returned for player ${user.playerTag}, skipping`);
                            continue;
                        }

                        // Create stats object
                        const stats = {
                            playerTag: playerData.tag,
                            discordId: user.discordId,
                            timestamp: new Date(),
                            name: playerData.name,
                            townHallLevel: playerData.townHallLevel,
                            expLevel: playerData.expLevel,
                            trophies: playerData.trophies,
                            bestTrophies: playerData.bestTrophies,
                            warStars: playerData.warStars,
                            attackWins: playerData.attackWins,
                            defenseWins: playerData.defenseWins,
                            builderHallLevel: playerData.builderHallLevel || 0,
                            versusTrophies: playerData.versusTrophies || 0,
                            clanName: playerData.clan?.name || 'No Clan',
                            clanTag: playerData.clan?.tag || '',
                            heroes: playerData.heroes?.map(hero => ({
                                name: hero.name,
                                level: hero.level,
                                maxLevel: hero.maxLevel
                            })) || [],
                            troops: playerData.troops?.filter(troop => !troop.village || troop.village === 'home')
                                .map(troop => ({
                                    name: troop.name,
                                    level: troop.level,
                                    maxLevel: troop.maxLevel
                                })) || [],
                            builderBaseTroops: playerData.troops?.filter(troop => troop.village === 'builderBase')
                                .map(troop => ({
                                    name: troop.name,
                                    level: troop.level,
                                    maxLevel: troop.maxLevel
                                })) || [],
                            spells: playerData.spells?.map(spell => ({
                                name: spell.name,
                                level: spell.level,
                                maxLevel: spell.maxLevel
                            })) || [],
                            donations: playerData.donations || 0,
                            donationsReceived: playerData.donationsReceived || 0
                        };

                        // Save to database
                        await PlayerStats.create(stats);

                        // Update tracking
                        this.lastStatsUpdate.set(user.playerTag, Date.now());

                        console.log(`Updated stats for ${playerData.name} (${playerData.tag})`);

                        // Add a small delay to avoid hitting API rate limits
                        await new Promise(resolve => setTimeout(resolve, 500));

                    } catch (error) {
                        console.error(`Error updating stats for ${user.playerTag}:`, error);
                        // Continue with next user
                    }
                }

                // Add a delay between batches
                if (i + this.statsUpdateBatchSize < linkedUsers.length) {
                    console.log(`Waiting before processing next batch of users...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            console.log('Automatic player stats update completed');

        } catch (error) {
            console.error('Error in automatic stats update:', error);
        }
    }

    /**
     * Find appropriate channel based on theme preferences
     * @param {Guild} guild Discord guild
     * @param {string} channelType Type of channel to find
     * @param {string} configuredId Optional configured channel ID
     * @returns {Promise<TextChannel|null>} Found channel or null
     */
    async findAppropriateChannel(guild, channelType, configuredId = null) {
        try {
            // If a specific channel ID is configured, try that first
            if (configuredId) {
                try {
                    const configuredChannel = await guild.channels.fetch(configuredId).catch(() => null);
                    if (configuredChannel) return configuredChannel;
                } catch (error) {
                    console.warn(`Configured channel ${configuredId} not found: ${error.message}`);
                }
            }

            // Fall back to finding a channel by name
            const channelNames = this.channelMappings[channelType] || [];
            for (const name of channelNames) {
                try {
                    const channel = guild.channels.cache.find(c =>
                        c.name && c.name.toLowerCase() === name.toLowerCase()
                    );
                    if (channel) return channel;
                } catch (error) {
                    console.warn(`Error finding channel by name ${name}: ${error.message}`);
                    // Continue to next name
                }
            }

            // If no matching channel, try to find any text channel
            if (channelType === 'general') {
                try {
                    // Last resort: find any text channel
                    const anyChannel = guild.channels.cache.find(c =>
                        c.type === 0 // TextChannel
                    );
                    if (anyChannel) return anyChannel;
                } catch (error) {
                    console.warn('Error finding fallback text channel:', error.message);
                }
            }

            // If no matching channel, return null
            console.log(`No suitable ${channelType} channel found for guild ${guild.name}`);
            return null;
        } catch (error) {
            console.error(`Error in findAppropriateChannel for ${channelType}:`, error);
            return null;
        }
    }

    // Check all clan wars and send notifications for state changes
    async checkWars() {
        try {
            console.log('Checking war states for all linked clans');
            const Clan = require('../models/Clan');
            const clans = await Clan.find({});

            if (!clans || clans.length === 0) {
                console.log('No linked clans found, skipping war check');
                return;
            }

            console.log(`Found ${clans.length} linked clans, checking wars`);

            for (const clan of clans) {
                try {
                    await this.checkClanWar(clan);
                } catch (error) {
                    console.error(`Error checking war for clan ${clan.clanTag}:`, error);
                    // Continue with next clan even if one fails
                }
            }
        } catch (error) {
            console.error('Error in automated war check:', error);
        }
    }

    // Check war state for a specific clan
    async checkClanWar(clan) {
        if (!clan.guildId || !clan.clanTag) {
            console.log('Clan missing guildId or clanTag, skipping');
            return;
        }

        // Get war data
        let warData;
        try {
            const clashApiService = require('./clashApiService');
            const cacheService = require('./cacheService');

            // Clear cache to get fresh data
            cacheService.delete(`currentWar:${clan.clanTag}`);
            warData = await clashApiService.getCurrentWar(clan.clanTag);
        } catch (error) {
            console.error(`Error fetching war data for ${clan.clanTag}:`, error);
            return;
        }

        // Get previous war state
        const previousState = this.lastWarStates.get(clan.clanTag) || 'unknown';
        const currentState = warData.state || 'notInWar';

        // Update stored state
        this.lastWarStates.set(clan.clanTag, currentState);

        // Check for state changes
        if (previousState !== 'unknown' && previousState !== currentState) {
            console.log(`War state changed for ${clan.name}: ${previousState} -> ${currentState}`);

            // Send notifications based on state change
            await this.sendWarStateChangeNotification(clan, previousState, currentState, warData);
        }
    }

    // Send notifications for war state changes
    async sendWarStateChangeNotification(clan, previousState, currentState, warData) {
        // Skip if notifications disabled
        if (!clan.settings?.notifications?.warStart && !clan.settings?.notifications?.warEnd) {
            return;
        }

        try {
            // Get guild and channel
            const guild = this.client.guilds.cache.get(clan.guildId);
            if (!guild) {
                console.log(`Guild ${clan.guildId} not found for clan ${clan.name}`);
                return;
            }

            // Find appropriate channel using configured ID or themed names
            const channelId = clan.settings?.channels?.warAnnouncements || clan.settings?.channels?.general;
            const channel = await this.findAppropriateChannel(guild, 'war', channelId);

            if (!channel) {
                console.log(`No suitable war channel found for clan ${clan.name}`);
                return;
            }

            const { EmbedBuilder } = require('discord.js');
            let embed;

            // War started notifications
            if (previousState === 'preparation' && currentState === 'inWar') {
                // Only notify if enabled
                if (!clan.settings?.notifications?.warStart) return;

                embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚔️ War Battle Day Has Started! ⚔️')
                    .setDescription(`The battle horns have sounded! War against **${warData.opponent?.name || 'the enemy clan'}** has begun!`)
                    .addFields(
                        { name: 'Army Size', value: `${warData.teamSize || '?'}v${warData.teamSize || '?'}`, inline: true },
                        { name: 'Battle Ends', value: warData.endTime ? new Date(warData.endTime).toLocaleString() : 'Unknown', inline: true },
                        { name: 'Instructions', value: 'Check #war-room for attack assignments and strategies.' }
                    )
                    .setTimestamp();

                await channel.send({ content: `**WAR HAS BEGUN!**`, embeds: [embed] });
            }

            // War ended notifications
            else if (previousState === 'inWar' && currentState === 'warEnded') {
                // Only notify if enabled
                if (!clan.settings?.notifications?.warEnd) return;

                // Determine result
                let result = 'Unknown';
                let color = '#3498db';
                let description = '';

                if (warData.clan?.stars > warData.opponent?.stars) {
                    result = '🏆 VICTORY!';
                    color = '#2ecc71';
                    description = `The halls of ${clan.name} echo with cheers of victory! We have defeated ${warData.opponent?.name || 'our enemies'}!`;
                } else if (warData.clan?.stars < warData.opponent?.stars) {
                    result = '😔 Defeat';
                    color = '#e74c3c';
                    description = `Our warriors fought valiantly, but ${warData.opponent?.name || 'the enemy'} has prevailed. We shall train harder for the next battle!`;
                } else if (warData.clan?.stars === warData.opponent?.stars) {
                    // If stars are equal, check destruction percentage
                    if (warData.clan?.destructionPercentage > warData.opponent?.destructionPercentage) {
                        result = '🏆 VICTORY! (by destruction)';
                        color = '#2ecc71';
                        description = `A close battle! We've defeated ${warData.opponent?.name || 'our enemies'} by destruction percentage!`;
                    } else if (warData.clan?.destructionPercentage < warData.opponent?.destructionPercentage) {
                        result = '😔 Defeat (by destruction)';
                        color = '#e74c3c';
                        description = `So close! We tied in stars but lost by destruction percentage. Keep practicing those attacks!`;
                    } else {
                        result = '🤝 PERFECT TIE!';
                        color = '#f39c12';
                        description = `An incredible display of equal might! Our battle with ${warData.opponent?.name || 'the enemy'} ends in a perfect tie!`;
                    }
                }

                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🏁 War Has Ended! 🏁')
                    .setDescription(description)
                    .addFields(
                        { name: 'Result', value: result, inline: false },
                        { name: `${clan.name} Stars`, value: `⭐ ${warData.clan?.stars || 0}`, inline: true },
                        { name: `${warData.opponent?.name || 'Opponent'} Stars`, value: `⭐ ${warData.opponent?.stars || 0}`, inline: true },
                        { name: `${clan.name} Destruction`, value: `${warData.clan?.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
                        { name: `${warData.opponent?.name || 'Opponent'} Destruction`, value: `${warData.opponent?.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
                    )
                    .setTimestamp();

                // Add league info if relevant
                if (warData.warLeague) {
                    embed.addFields({
                        name: 'League Info',
                        value: `This was a ${warData.warLeague.name} war`
                    });
                }

                // Add summary of top performers if available
                if (warData.clan?.members?.length > 0) {
                    try {
                        const topAttackers = this.getTopPerformers(warData.clan.members);
                        if (topAttackers) {
                            embed.addFields({
                                name: 'Top Warriors',
                                value: topAttackers
                            });
                        }
                    } catch (error) {
                        console.error('Error getting top performers:', error);
                    }
                }

                await channel.send({ embeds: [embed] });

                // NEW CODE: Track war history in database
                try {
                    const warTrackerService = require('./warTrackerService');
                    await warTrackerService.trackWarEnd(warData, clan);
                    console.log(`Tracked war history for ${clan.name} vs ${warData.opponent?.name || 'opponent'}`);

                    // Add a note to the channel about war history being available
                    await channel.send({
                        content: `📊 **War history has been recorded!** Use \`/warhistory\` to view detailed stats from this and past wars.`
                    });
                } catch (error) {
                    console.error('Failed to track war history:', error);
                }
            }

        } catch (error) {
            console.error(`Error sending war notification for ${clan.name}:`, error);
        }
    }

    // Get top performers from war
    getTopPerformers(members) {
        if (!members || !Array.isArray(members) || members.length === 0) return null;

        // Sort by stars then destruction
        const sortedMembers = [...members].sort((a, b) => {
            const aStars = a.attacks?.reduce((sum, attack) => sum + (attack.stars || 0), 0) || 0;
            const bStars = b.attacks?.reduce((sum, attack) => sum + (attack.stars || 0), 0) || 0;

            if (bStars !== aStars) return bStars - aStars;

            const aDestruction = a.attacks?.reduce((sum, attack) => sum + (attack.destructionPercentage || 0), 0) || 0;
            const bDestruction = b.attacks?.reduce((sum, attack) => sum + (attack.destructionPercentage || 0), 0) || 0;

            return bDestruction - aDestruction;
        });

        // Get top 3 performers
        const topPerformers = sortedMembers.slice(0, 3);
        if (topPerformers.length === 0) return null;

        return topPerformers.map((member, index) => {
            const totalStars = member.attacks?.reduce((sum, attack) => sum + (attack.stars || 0), 0) || 0;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            return `${medal} **${member.name}**: ${totalStars} ⭐`;
        }).join('\n');
    }
}

module.exports = AutomationService;