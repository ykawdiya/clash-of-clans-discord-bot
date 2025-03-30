// src/services/warTrackerService.js
const WarHistory = require('../models/WarHistory');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

class WarTrackerService {
    constructor() {
        this.warEndListeners = new Set();
    }

    /**
     * Track a war that has just ended and save detailed information
     * @param {Object} warData - Full war data from the API
     * @param {Object} clan - Associated clan information
     */
    async trackWarEnd(warData, clan) {
        try {
            if (!warData || !clan || !warData.opponent) {
                log.warn('Invalid war data for tracking', { hasWarData: !!warData, hasClan: !!clan });
                return null;
            }

            // Create a unique war ID
            const warId = `${clan.clanTag}-${warData.opponent.tag}-${warData.endTime}`;

            // Check if we've already saved this war
            const existingWar = await WarHistory.findOne({ warId });
            if (existingWar) {
                log.info('War already tracked', { warId });
                return existingWar;
            }

            // Determine result
            let result = 'tie';
            if (warData.clan.stars > warData.opponent.stars) {
                result = 'win';
            } else if (warData.clan.stars < warData.opponent.stars) {
                result = 'lose';
            } else if (warData.clan.destructionPercentage > warData.opponent.destructionPercentage) {
                result = 'win';
            } else if (warData.clan.destructionPercentage < warData.opponent.destructionPercentage) {
                result = 'lose';
            }

            // Process war data to fit our schema
            const processedClanData = this._processClanWarData(warData.clan);
            const processedOpponentData = this._processClanWarData(warData.opponent);

            // Create war history record
            const warHistory = new WarHistory({
                clanTag: clan.clanTag,
                guildId: clan.guildId,
                warId,
                preparationStartTime: warData.preparationStartTime ? new Date(warData.preparationStartTime) : null,
                startTime: warData.startTime ? new Date(warData.startTime) : null,
                endTime: warData.endTime ? new Date(warData.endTime) : new Date(),
                warType: warData.warType || 'random',
                teamSize: warData.teamSize,
                clan: {
                    tag: clan.clanTag,
                    name: warData.clan.name,
                    level: warData.clan.clanLevel,
                    attacks: processedClanData.totalAttacks,
                    stars: warData.clan.stars,
                    destructionPercentage: warData.clan.destructionPercentage,
                    members: processedClanData.members
                },
                opponent: {
                    tag: warData.opponent.tag,
                    name: warData.opponent.name,
                    level: warData.opponent.clanLevel,
                    attacks: processedOpponentData.totalAttacks,
                    stars: warData.opponent.stars,
                    destructionPercentage: warData.opponent.destructionPercentage,
                    members: processedOpponentData.members
                },
                result
            });

            // Save to database
            await warHistory.save();

            // Keep only the last 10 wars for this clan
            const warCount = await WarHistory.countDocuments({ clanTag: clan.clanTag });
            if (warCount > 10) {
                // Find the oldest war(s) beyond the 10th and delete them
                const oldestWars = await WarHistory.find({ clanTag: clan.clanTag })
                    .sort({ endTime: 1 })
                    .limit(warCount - 10);

                if (oldestWars.length > 0) {
                    const oldestWarIds = oldestWars.map(war => war._id);
                    await WarHistory.deleteMany({ _id: { $in: oldestWarIds } });
                    log.info(`Deleted ${oldestWars.length} old wars to maintain 10-war history`, {
                        clanTag: clan.clanTag
                    });
                }
            }

            log.info('Tracked new war for clan history', {
                clanTag: clan.clanTag,
                opponentTag: warData.opponent.tag,
                result,
                warId
            });

            // Notify listeners
            this._notifyWarEndListeners(warHistory);

            return warHistory;
        } catch (error) {
            log.error('Error tracking war end', { error: error.message, stack: error.stack });
            return null;
        }
    }

    /**
     * Process clan war data to extract and format member information
     * @private
     */
    _processClanWarData(clanWarData) {
        if (!clanWarData || !clanWarData.members) {
            return { totalAttacks: 0, members: [] };
        }

        let totalAttacks = 0;

        // Process each member
        const members = clanWarData.members.map(member => {
            const attacks = member.attacks ? member.attacks.map((attack, index) => {
                totalAttacks++;
                return {
                    attackerTag: member.tag,
                    attackerName: member.name,
                    attackerTownhallLevel: member.townhallLevel,
                    attackerMapPosition: member.mapPosition,
                    defenderTag: attack.defenderTag,
                    defenderName: attack.defenderName || 'Unknown',
                    defenderTownhallLevel: attack.defenderTownhallLevel || 0,
                    defenderMapPosition: attack.defenderMapPosition || 0,
                    stars: attack.stars,
                    destructionPercentage: attack.destructionPercentage,
                    order: index + 1,
                    duration: attack.duration || 0,
                    timestamp: attack.timestamp ? new Date(attack.timestamp) : new Date()
                };
            }) : [];

            // Get best attack against this member
            let bestOpponentAttack = null;
            if (member.bestOpponentAttack) {
                bestOpponentAttack = {
                    attackerName: member.bestOpponentAttack.attackerName || 'Unknown',
                    attackerTag: member.bestOpponentAttack.attackerTag,
                    stars: member.bestOpponentAttack.stars,
                    destructionPercentage: member.bestOpponentAttack.destructionPercentage
                };
            }

            return {
                playerTag: member.tag,
                name: member.name,
                townhallLevel: member.townhallLevel,
                mapPosition: member.mapPosition,
                attacks,
                attacksUsed: attacks.length,
                bestOpponentAttack,
                opponentAttacks: member.opponentAttacks || 0
            };
        });

        return { totalAttacks, members };
    }

    /**
     * Add a listener for war end events
     * @param {Function} listener - Callback function that receives war history data
     */
    onWarEnd(listener) {
        this.warEndListeners.add(listener);
    }

    /**
     * Remove a war end listener
     * @param {Function} listener - Listener to remove
     */
    removeWarEndListener(listener) {
        this.warEndListeners.delete(listener);
    }

    /**
     * Notify all listeners about a war end
     * @private
     */
    _notifyWarEndListeners(warHistory) {
        this.warEndListeners.forEach(listener => {
            try {
                listener(warHistory);
            } catch (error) {
                log.error('Error in war end listener', { error: error.message });
            }
        });
    }

    /**
     * Get war history for a clan
     * @param {string} clanTag - Clan tag
     * @param {number} limit - Max number of wars to retrieve (default 10)
     */
    async getWarHistory(clanTag, limit = 10) {
        return WarHistory.getRecentWars(clanTag, limit);
    }

    /**
     * Get a specific war by ID
     * @param {string} warId - War ID
     */
    async getWarById(warId) {
        return WarHistory.findOne({ warId });
    }

    /**
     * Get war statistics for a player across recent wars
     * @param {string} playerTag - Player tag
     * @param {string} clanTag - Clan tag
     */
    async getPlayerWarStats(playerTag, clanTag) {
        const recentWars = await WarHistory.find({
            clanTag,
            'clan.members.playerTag': playerTag
        }).sort({ endTime: -1 }).limit(10);

        // Process wars to extract player performance
        const warStats = {
            totalWars: recentWars.length,
            attacksUsed: 0,
            totalPossibleAttacks: recentWars.length * 2,
            starsEarned: 0, // This will now be the sum of max stars per war (max 3 per war)
            totalDestruction: 0,
            averageDestruction: 0,
            averageStars: 0,
            threeStarAttacks: 0,
            twoStarAttacks: 0,
            oneStarAttacks: 0,
            zeroStarAttacks: 0,
            missedAttacks: 0,
            warsParticipated: 0
        };

        recentWars.forEach(war => {
            const member = war.clan.members.find(m => m.playerTag === playerTag);
            if (!member) return;

            warStats.warsParticipated++;
            const attackCount = member.attacks?.length || 0;
            warStats.attacksUsed += attackCount;
            warStats.missedAttacks += (2 - attackCount);

            // Track attack stats (stars per attack, destruction, etc.)
            if (member.attacks && member.attacks.length > 0) {
                // For detailed attack statistics (per attack)
                member.attacks.forEach(attack => {
                    warStats.totalDestruction += attack.destructionPercentage;

                    if (attack.stars === 3) warStats.threeStarAttacks++;
                    else if (attack.stars === 2) warStats.twoStarAttacks++;
                    else if (attack.stars === 1) warStats.oneStarAttacks++;
                    else warStats.zeroStarAttacks++;
                });

                // For war stars calculation (max 3 per war)
                // Group attacks by defender to find the max stars per base
                const attacksByDefender = {};
                member.attacks.forEach(attack => {
                    const defenderId = attack.defenderTag;
                    if (!attacksByDefender[defenderId] || attacksByDefender[defenderId] < attack.stars) {
                        attacksByDefender[defenderId] = attack.stars;
                    }
                });

                // Sum the max stars per base (max 3 per war)
                const warStars = Object.values(attacksByDefender).reduce((sum, stars) => sum + stars, 0);
                // Cap at 3 stars per war (CoC rules)
                warStats.starsEarned += Math.min(warStars, 3);
            }
        });

        // Calculate averages
        if (warStats.attacksUsed > 0) {
            warStats.averageDestruction = warStats.totalDestruction / warStats.attacksUsed;
            // Average stars per attack (not per war)
            warStats.averageStars = (warStats.threeStarAttacks * 3 + warStats.twoStarAttacks * 2 + warStats.oneStarAttacks * 1) / warStats.attacksUsed;
        }

        return warStats;
    }
}

module.exports = new WarTrackerService();