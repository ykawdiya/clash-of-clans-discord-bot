// src/models/CapitalTracking.js
const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema({
    name: String,
    level: Number,
    nextUpgradeCost: Number,
    lastUpgraded: Date
}, { _id: false });

const contributionSchema = new mongoose.Schema({
    playerTag: String,
    name: String,
    contribution: Number,
    week: String,
    timestamp: Date
}, { _id: false });

const raidAttackSchema = new mongoose.Schema({
    playerTag: String,
    name: String,
    districtsDestroyed: Number,
    capitalGoldLooted: Number,
    attackTime: Date
}, { _id: false });

const raidWeekendSchema = new mongoose.Schema({
    startDate: Date,
    endDate: Date,
    totalAttacks: {
        type: Number,
        default: 0
    },
    districtsDestroyed: {
        type: Number,
        default: 0
    },
    capitalGoldLooted: {
        type: Number,
        default: 0
    },
    medalsEarned: {
        type: Number,
        default: 0
    },
    totalAttacksAvailable: {
        type: Number,
        default: 0
    },
    attacks: [raidAttackSchema]
}, { _id: false });

const capitalTrackingSchema = new mongoose.Schema({
    // Reference fields
    clanTag: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },

    // Capital Overview
    capitalHallLevel: {
        type: Number,
        default: 1
    },
    totalDistrictsUnlocked: {
        type: Number,
        default: 1
    },

    // District tracking
    districts: [districtSchema],

    // Contribution tracking
    weeklyContributions: {
        type: Map,
        of: [contributionSchema],
        default: {}
    },

    // Current week totals
    currentWeek: String,
    currentWeekTotal: {
        type: Number,
        default: 0
    },

    // Raid weekend tracking
    isRaidWeekend: {
        type: Boolean,
        default: false
    },
    currentRaid: {
        startDate: Date,
        endDate: Date,
        currentAttacks: {
            type: Number,
            default: 0
        },
        districtsDestroyed: {
            type: Number,
            default: 0
        }
    },

    // Historical raid weekends
    raidWeekends: [raidWeekendSchema],

    // Metadata
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for efficient queries
capitalTrackingSchema.index({ clanTag: 1 });
capitalTrackingSchema.index({ guildId: 1 });
capitalTrackingSchema.index({ 'currentRaid.startDate': 1 });

module.exports = mongoose.model('CapitalTracking', capitalTrackingSchema);
