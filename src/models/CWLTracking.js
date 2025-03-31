// src/models/CWLTracking.js
const mongoose = require('mongoose');

const cwlAttackSchema = new mongoose.Schema({
    warDay: Number,
    attackerTag: String,
    attackerName: String,
    defenderTag: String,
    defenderName: String,
    defenderClan: String,
    stars: Number,
    destructionPercentage: Number,
    attackTime: Date
}, { _id: false });

const cwlMemberSchema = new mongoose.Schema({
    playerTag: String,
    name: String,
    townhallLevel: Number,
    inWar: {
        type: Boolean,
        default: false
    },
    attacksUsed: {
        type: Number,
        default: 0
    },
    starsEarned: {
        type: Number,
        default: 0
    },
    totalDestruction: {
        type: Number,
        default: 0
    },
    attacks: [cwlAttackSchema]
}, { _id: false });

const cwlDaySchema = new mongoose.Schema({
    day: Number,
    opponent: {
        name: String,
        tag: String
    },
    startTime: Date,
    endTime: Date,
    outcome: {
        type: String,
        enum: ['win', 'lose', 'tie', 'ongoing'],
        default: 'ongoing'
    },
    stars: {
        type: Number,
        default: 0
    },
    opponentStars: {
        type: Number,
        default: 0
    },
    destruction: {
        type: Number,
        default: 0
    },
    opponentDestruction: {
        type: Number,
        default: 0
    },
    attacksUsed: {
        type: Number,
        default: 0
    }
}, { _id: false });

const cwlTrackingSchema = new mongoose.Schema({
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

    // Season identification
    season: String, // e.g., "May 2023"
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // League information
    league: String,

    // Current status
    currentDay: {
        type: Number,
        default: 0
    },

    // Roster
    roster: [String], // Player tags in the roster

    // Daily wars
    warDays: [cwlDaySchema],

    // Member performance
    members: [cwlMemberSchema],

    // Medal earnings
    medalEarnings: {
        type: Number,
        default: 0
    },

    // Overall results
    finalPosition: Number,
    warWins: {
        type: Number,
        default: 0
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
cwlTrackingSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Indexes for efficient queries
cwlTrackingSchema.index({ clanTag: 1, isActive: 1 });
cwlTrackingSchema.index({ guildId: 1, isActive: 1 });
cwlTrackingSchema.index({ season: 1, clanTag: 1 });

module.exports = mongoose.model('CWLTracking', cwlTrackingSchema);
