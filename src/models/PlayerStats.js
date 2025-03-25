const mongoose = require('mongoose');

const heroSchema = new mongoose.Schema({
    name: String,
    level: Number,
    maxLevel: Number
}, { _id: false });

const troopSchema = new mongoose.Schema({
    name: String,
    level: Number,
    maxLevel: Number
}, { _id: false });

const spellSchema = new mongoose.Schema({
    name: String,
    level: Number,
    maxLevel: Number
}, { _id: false });

const playerStatsSchema = new mongoose.Schema({
    // Player identification
    playerTag: {
        type: String,
        required: true,
        index: true
    },

    // Discord user who owns/tracks this player
    discordId: {
        type: String,
        required: true,
        index: true
    },

    // When these stats were recorded
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Basic player info
    name: String,
    townHallLevel: Number,
    expLevel: Number,

    // Trophy stats
    trophies: Number,
    bestTrophies: Number,

    // War stats
    warStars: Number,

    // Attack & defense stats
    attackWins: Number,
    defenseWins: Number,

    // Builder base stats
    builderHallLevel: Number,
    versusTrophies: Number,

    // Clan information
    clanName: String,
    clanTag: String,

    // Heroes, troops, and spells
    heroes: [heroSchema],
    troops: [troopSchema],
    builderBaseTroops: [troopSchema],
    spells: [spellSchema],

    // Additional metadata
    donations: Number,
    donationsReceived: Number,

    // Computed overall progress
    progressPercentage: {
        type: Number,
        default: function() {
            // Calculate progress based on troops, heroes, and spells
            return 0; // A more complex calculation would be implemented here
        }
    }
});

// Index to efficiently find a player's most recent stats
playerStatsSchema.index({ playerTag: 1, timestamp: -1 });

// Method to get progress since a specific date
playerStatsSchema.statics.getProgressSince = async function(playerTag, date) {
    const earliest = await this.findOne({
        playerTag: playerTag,
        timestamp: { $gte: date }
    }).sort({ timestamp: 1 }).lean();

    const latest = await this.findOne({
        playerTag: playerTag
    }).sort({ timestamp: -1 }).lean();

    if (!earliest || !latest) {
        return null;
    }

    return {
        earliest,
        latest,
        thLevelDiff: latest.townHallLevel - earliest.townHallLevel,
        trophyDiff: latest.trophies - earliest.trophies,
        warStarsDiff: latest.warStars - earliest.warStars,
        daysTracked: Math.round((latest.timestamp - earliest.timestamp) / (1000 * 60 * 60 * 24))
    };
};

// Method to get a player's progress over various time periods
playerStatsSchema.statics.getProgressSummary = async function(playerTag) {
    const now = new Date();

    // Get dates for various time periods
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const threeMonthsAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    const oneYearAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));

    const [weekProgress, monthProgress, quarterProgress, yearProgress, allTimeProgress] = await Promise.all([
        this.getProgressSince(playerTag, oneWeekAgo),
        this.getProgressSince(playerTag, oneMonthAgo),
        this.getProgressSince(playerTag, threeMonthsAgo),
        this.getProgressSince(playerTag, oneYearAgo),
        this.getProgressSince(playerTag, new Date(0))
    ]);

    return {
        weekProgress,
        monthProgress,
        quarterProgress,
        yearProgress,
        allTimeProgress
    };
};

module.exports = mongoose.model('PlayerStats', playerStatsSchema);