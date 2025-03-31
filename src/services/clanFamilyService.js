// src/services/clanFamilyService.js
const { v4: uuidv4 } = require('uuid');
const Clan = require('../models/Clan');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

class ClanFamilyService {
    /**
     * Create a new clan family
     * @param {String} guildId - Discord guild ID
     * @param {String} familyName - Name for the clan family
     * @param {String} mainClanTag - Main clan tag
     * @returns {Object} Created family info
     */
    async createFamily(guildId, familyName, mainClanTag) {
        try {
            // Generate a unique family ID
            const familyId = uuidv4();

            // Check if main clan exists and fetch data
            const clanData = await clashApiService.getClan(mainClanTag);
            if (!clanData) {
                throw new Error('Clan not found');
            }

            // Check if the clan is already registered
            const existingClan = await Clan.findOne({ clanTag: clanData.tag });
            if (existingClan) {
                // If existing clan has a family already
                if (existingClan.familyId) {
                    throw new Error('This clan is already part of a family');
                }

                // Update existing clan record
                existingClan.familyId = familyId;
                existingClan.familyRole = 'main';
                existingClan.familyName = familyName;
                existingClan.isPrimary = true;
                existingClan.guildId = guildId;

                await existingClan.save();

                return {
                    familyId,
                    familyName,
                    mainClan: existingClan
                };
            }

            // Create new clan record
            const newClan = new Clan({
                clanTag: clanData.tag,
                name: clanData.name,
                guildId,
                description: clanData.description,
                familyId,
                familyRole: 'main',
                familyName,
                isPrimary: true,
                sortOrder: 0
            });

            await newClan.save();

            log.info(`Created new clan family: ${familyName}`, {
                familyId,
                guildId,
                mainClanTag: clanData.tag
            });

            return {
                familyId,
                familyName,
                mainClan: newClan
            };
        } catch (error) {
            log.error('Error creating clan family', {
                error: error.message,
                guildId,
                mainClanTag
            });
            throw error;
        }
    }

    /**
     * Add a clan to an existing family
     * @param {String} familyId - The family ID
     * @param {String} clanTag - Clan tag to add
     * @param {String} role - Role within the family
     * @param {Number} sortOrder - Optional display order
     * @returns {Object} Added clan
     */
    async addClanToFamily(familyId, clanTag, role = 'feeder', sortOrder = null) {
        try {
            // Check if family exists
            const familyExists = await Clan.exists({ familyId });
            if (!familyExists) {
                throw new Error('Family not found');
            }

            // Fetch clan data from API
            const clanData = await clashApiService.getClan(clanTag);
            if (!clanData) {
                throw new Error('Clan not found');
            }

            // Check if clan is already in a family
            const existingClan = await Clan.findOne({ clanTag: clanData.tag });
            if (existingClan) {
                if (existingClan.familyId && existingClan.familyId !== familyId) {
                    throw new Error('Clan is already part of a different family');
                }

                // Update existing clan
                existingClan.familyId = familyId;
                existingClan.familyRole = role;

                // Get family details
                const mainClan = await Clan.findOne({ familyId, familyRole: 'main' });
                if (mainClan) {
                    existingClan.familyName = mainClan.familyName;
                    existingClan.guildId = mainClan.guildId;
                }

                if (sortOrder !== null) {
                    existingClan.sortOrder = sortOrder;
                }

                await existingClan.save();
                return existingClan;
            }

            // Get guild ID from main clan
            const mainClan = await Clan.findOne({ familyId, familyRole: 'main' });
            if (!mainClan) {
                throw new Error('Main clan not found for this family');
            }

            // Create new clan record
            const newSortOrder = sortOrder !== null ? sortOrder : await this._getNextSortOrder(familyId);
            const newClan = new Clan({
                clanTag: clanData.tag,
                name: clanData.name,
                guildId: mainClan.guildId,
                description: clanData.description,
                familyId,
                familyRole: role,
                familyName: mainClan.familyName,
                isPrimary: false,
                sortOrder: newSortOrder
            });

            await newClan.save();

            log.info(`Added clan to family: ${clanData.name}`, {
                familyId,
                role,
                clanTag: clanData.tag
            });

            return newClan;
        } catch (error) {
            log.error('Error adding clan to family', {
                error: error.message,
                familyId,
                clanTag
            });
            throw error;
        }
    }

    /**
     * Get all clans in a family
     * @param {String} familyId - Family ID
     * @returns {Array} Family clans
     */
    async getFamilyClans(familyId) {
        return Clan.find({ familyId }).sort({ sortOrder: 1, isPrimary: -1 });
    }

    /**
     * Get family for a guild
     * @param {String} guildId - Discord guild ID
     * @returns {Object} Family info with clans
     */
    async getFamilyByGuild(guildId) {
        // Find primary clan for this guild
        const primaryClan = await Clan.findOne({ guildId, isPrimary: true });
        if (!primaryClan || !primaryClan.familyId) {
            return null;
        }

        // Get all clans in this family
        const clans = await Clan.find({ familyId: primaryClan.familyId }).sort({ sortOrder: 1, isPrimary: -1 });

        return {
            familyId: primaryClan.familyId,
            familyName: primaryClan.familyName,
            mainClan: clans.find(c => c.familyRole === 'main'),
            clans
        };
    }

    /**
     * Get the next available sort order for a family
     * @private
     */
    async _getNextSortOrder(familyId) {
        const highestOrder = await Clan.findOne({ familyId }).sort({ sortOrder: -1 }).select('sortOrder');
        return (highestOrder?.sortOrder || 0) + 10;
    }

    /**
     * Remove a clan from a family
     * @param {String} clanTag - Clan tag to remove
     * @returns {Boolean} Success status
     */
    async removeClanFromFamily(clanTag) {
        try {
            const clan = await Clan.findOne({ clanTag });
            if (!clan) {
                throw new Error('Clan not found');
            }

            // If this is the main clan, check if it's the only clan in the family
            if (clan.familyRole === 'main') {
                const familyCount = await Clan.countDocuments({ familyId: clan.familyId });
                if (familyCount > 1) {
                    throw new Error('Cannot remove main clan while other clans are in the family');
                }
            }

            // Remove family association
            clan.familyId = null;
            clan.familyRole = 'main';
            clan.familyName = null;

            await clan.save();

            log.info(`Removed clan from family: ${clan.name}`, {
                clanTag
            });

            return true;
        } catch (error) {
            log.error('Error removing clan from family', {
                error: error.message,
                clanTag
            });
            throw error;
        }
    }

    /**
     * Update clan family settings
     * @param {String} familyId - Family ID
     * @param {Object} settings - Settings to update
     * @returns {Object} Updated family info
     */
    async updateFamilySettings(familyId, settings) {
        try {
            const mainClan = await Clan.findOne({ familyId, familyRole: 'main' });
            if (!mainClan) {
                throw new Error('Family not found');
            }

            if (settings.familyName) {
                // Update family name across all clans
                await Clan.updateMany(
                    { familyId },
                    { $set: { familyName: settings.familyName } }
                );
            }

            // Return updated family
            return this.getFamilyClans(familyId);
        } catch (error) {
            log.error('Error updating family settings', {
                error: error.message,
                familyId
            });
            throw error;
        }
    }

    /**
     * Get family overview with stats
     * @param {String} familyId - Family ID
     * @returns {Object} Family overview
     */
    async getFamilyOverview(familyId) {
        try {
            // Get all clans in the family
            const clans = await Clan.find({ familyId }).sort({ sortOrder: 1, isPrimary: -1 });
            if (clans.length === 0) {
                throw new Error('Family not found');
            }

            // Fetch fresh data for each clan
            const clansData = await Promise.all(
                clans.map(async (clan) => {
                    try {
                        const clanData = await clashApiService.getClan(clan.clanTag);
                        return {
                            ...clan.toObject(),
                            apiData: clanData
                        };
                    } catch (error) {
                        log.error(`Error fetching clan data for overview: ${clan.clanTag}`, { error: error.message });
                        return {
                            ...clan.toObject(),
                            apiData: null
                        };
                    }
                })
            );

            // Calculate family stats
            const totalMembers = clansData.reduce((sum, clan) => sum + (clan.apiData?.members || 0), 0);
            const totalClans = clansData.length;
            const totalWars = clansData.reduce((sum, clan) => sum + ((clan.apiData?.warWins || 0) + (clan.apiData?.warLosses || 0) + (clan.apiData?.warTies || 0)), 0);
            const totalWarWins = clansData.reduce((sum, clan) => sum + (clan.apiData?.warWins || 0), 0);

            const familyStats = {
                name: clans[0].familyName,
                totalClans,
                totalMembers,
                totalWars,
                totalWarWins,
                winRate: totalWars > 0 ? ((totalWarWins / totalWars) * 100).toFixed(1) + '%' : 'N/A',
                averageClanLevel: clansData.reduce((sum, clan) => sum + (clan.apiData?.clanLevel || 0), 0) / totalClans
            };

            return {
                stats: familyStats,
                clans: clansData
            };
        } catch (error) {
            log.error('Error getting family overview', {
                error: error.message,
                familyId
            });
            throw error;
        }
    }
}

module.exports = new ClanFamilyService();