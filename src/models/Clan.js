// src/models/Clan.js
const mongoose = require('mongoose');

const clanSchema = new mongoose.Schema({
    // Basic clan information
    clanTag: {
        type: String,
        required: true,
        unique: true
    },
    guildId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    level: {
        type: Number,
        required: true
    },

    // War tracking fields
    warStats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        ties: { type: Number, default: 0 },
        winStreak: { type: Number, default: 0 },
        currentWinStreak: { type: Number, default: 0 }
    },

    // CWL tracking fields
    cwlStats: {
        currentLeague: String,
        currentSeason: String,
        promotions: { type: Number, default: 0 },
        demotions: { type: Number, default: 0 },
        bestPosition: Number
    },

    // Capital tracking fields
    capitalStats: {
        raidMedalsEarned: { type: Number, default: 0 },
        capitalGoldContributed: { type: Number, default: 0 },
        districtsMaxed: { type: Number, default: 0 },
        lastMilestone: { type: Number, default: 0 }
    },

    // Core feature channels for notifications
    channels: {
        // Original channels
        warAnnouncements: String,
        clanGames: String,
        general: String,

        // New channels for core features
        warPlanning: String,
        baseCalling: String,
        attackTracker: String,

        cwlAnnouncements: String,
        cwlRoster: String,
        cwlDailyMatchups: String,

        capitalStatus: String,
        raidWeekends: String,
        contributionTracker: String,
        upgradePlanning: String
    },

    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save hook to update timestamps
clanSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Clan', clanSchema);