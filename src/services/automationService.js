// src/services/automationService.js
const { EmbedBuilder } = require('discord.js');
const clashApiService = require('./clashApiService');
const Clan = require('../models/Clan');
const cacheService = require('./cacheService');

class AutomationService {
    constructor(client) {
        this.client = client;
        this.checkInterval = 10 * 60 * 1000; // 10 minutes
        this.warCheckInterval = null;
        this.lastWarStates = new Map(); // Store last war states
    }

    // Start all automated checks
    startAutomation() {
        console.log('Starting automation service');
        this.stopAutomation(); // Clear any existing intervals

        // Set new intervals
        this.warCheckInterval = setInterval(() => this.checkWars(), this.checkInterval);

        console.log('Automation service started');
    }

    // Stop all automated checks
    stopAutomation() {
        if (this.warCheckInterval) {
            clearInterval(this.warCheckInterval);
            this.warCheckInterval = null;
        }
    }

    // Check all clan wars and send notifications for state changes
    async checkWars() {
        try {
            console.log('Checking war states for all linked clans');
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

        // Get notification channel
        const channelId = clan.settings?.channels?.warAnnouncements || clan.settings?.channels?.general;
        if (!channelId) {
            console.log(`No notification channel found for clan ${clan.name}`);
            return;
        }

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                console.log(`Channel ${channelId} not found or inaccessible`);
                return;
            }

            let embed;

            // War started notifications
            if (previousState === 'preparation' && currentState === 'inWar') {
                // Only notify if enabled
                if (!clan.settings?.notifications?.warStart) return;

                embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚔️ War Has Started! ⚔️')
                    .setDescription(`Battle day has begun against ${warData.opponent?.name || 'the enemy clan'}!`)
                    .addFields(
                        { name: 'War Size', value: `${warData.teamSize || '?'}v${warData.teamSize || '?'}`, inline: true },
                        { name: 'End Time', value: warData.endTime ? new Date(warData.endTime).toLocaleString() : 'Unknown', inline: true }
                    )
                    .setTimestamp();

                // Add role mention if configured
                const mentionRole = clan.settings?.roles?.everyone;
                const mentionText = mentionRole ? `<@&${mentionRole}> ` : '';

                await channel.send({ content: `${mentionText}War has started!`, embeds: [embed] });
            }

            // War ended notifications
            else if (previousState === 'inWar' && currentState === 'warEnded') {
                // Only notify if enabled
                if (!clan.settings?.notifications?.warEnd) return;

                // Determine result
                let result = 'Unknown';
                let color = '#3498db';

                if (warData.clan?.stars > warData.opponent?.stars) {
                    result = '🏆 Victory!';
                    color = '#2ecc71';
                } else if (warData.clan?.stars < warData.opponent?.stars) {
                    result = '😔 Defeat';
                    color = '#e74c3c';
                } else if (warData.clan?.stars === warData.opponent?.stars) {
                    // If stars are equal, check destruction percentage
                    if (warData.clan?.destructionPercentage > warData.opponent?.destructionPercentage) {
                        result = '🏆 Victory! (by destruction percentage)';
                        color = '#2ecc71';
                    } else if (warData.clan?.destructionPercentage < warData.opponent?.destructionPercentage) {
                        result = '😔 Defeat (by destruction percentage)';
                        color = '#e74c3c';
                    } else {
                        result = '🤝 Perfect Tie!';
                        color = '#f39c12';
                    }
                }

                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🏁 War Has Ended! 🏁')
                    .setDescription(`The war against ${warData.opponent?.name || 'the enemy clan'} has ended!`)
                    .addFields(
                        { name: 'Result', value: result, inline: false },
                        { name: `${clan.name} Stars`, value: `⭐ ${warData.clan?.stars || 0}`, inline: true },
                        { name: `${warData.opponent?.name || 'Opponent'} Stars`, value: `⭐ ${warData.opponent?.stars || 0}`, inline: true },
                        { name: `${clan.name} Destruction`, value: `${warData.clan?.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
                        { name: `${warData.opponent?.name || 'Opponent'} Destruction`, value: `${warData.opponent?.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
                    )
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error(`Error sending war notification for ${clan.name}:`, error);
        }
    }
}

module.exports = AutomationService;