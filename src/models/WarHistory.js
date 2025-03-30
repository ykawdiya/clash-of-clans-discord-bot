// src/models/WarHistory.js
const mongoose = require('mongoose');

// Schema for individual attack details
const attackSchema = new mongoose.Schema({
    attackerTag: String,
    attackerName: String,
    attackerTownhallLevel: Number,
    attackerMapPosition: Number,
    defenderTag: String,
    defenderName: String,
    defenderTownhallLevel: Number,
    defenderMapPosition: Number,
    stars: Number,
    destructionPercentage: Number,
    order: Number, // Attack order in the war
    duration: Number, // Attack duration in seconds
    timestamp: Date // When attack happened
}, { _id: false });

// Schema for member participation
const warMemberSchema = new mongoose.Schema({
    playerTag: String,
    name: String,
    townhallLevel: Number,
    mapPosition: Number,
    attacks: [attackSchema],
    attacksUsed: Number,
    bestOpponentAttack: {
        attackerName: String,
        attackerTag: String,
        stars: Number,
        destructionPercentage: Number
    },
    opponentAttacks: Number
}, { _id: false });

// Main War History schema
const warHistorySchema = new mongoose.Schema({
    // References
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

    // War identification
    warId: {
        type: String,
        required: true,
        unique: true
    },

    // Timings
    preparationStartTime: Date,
    startTime: Date,
    endTime: Date,

    // War details
    warType: {
        type: String,
        enum: ['random', 'friendly', 'cwl'],
        default: 'random'
    },

    // Size
    teamSize: Number,

    // Clan info
    clan: {
        tag: String,
        name: String,
        level: Number,
        attacks: Number,
        stars: Number,
        destructionPercentage: Number,
        members: [warMemberSchema]
    },

    // Opponent info
    opponent: {
        tag: String,
        name: String,
        level: Number,
        attacks: Number,
        stars: Number,
        destructionPercentage: Number,
        members: [warMemberSchema]
    },

    // Result
    result: {
        type: String,
        enum: ['win', 'lose', 'tie'],
        required: true
    },

    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create index for efficient queries
warHistorySchema.index({ clanTag: 1, endTime: -1 });
warHistorySchema.index({ guildId: 1, endTime: -1 });

// Static method to get wars for a clan (most recent first)
warHistorySchema.statics.getRecentWars = async function(clanTag, limit = 10) {
    return this.find({ clanTag })
        .sort({ endTime: -1 })
        .limit(limit);
};

// Method to generate war summary
warHistorySchema.methods.getSummary = function() {
    const clanAttacks = this.clan.members.reduce((total, member) => total + (member.attacks?.length || 0), 0);
    const opponentAttacks = this.opponent.members.reduce((total, member) => total + (member.attacks?.length || 0), 0);

    const totalPossibleAttacks = this.teamSize * 2;

    return {
        opponent: this.opponent.name,
        result: this.result,
        endTime: this.endTime,
        teamSize: this.teamSize,
        stars: `${this.clan.stars}-${this.opponent.stars}`,
        destruction: `${this.clan.destructionPercentage.toFixed(2)}%-${this.opponent.destructionPercentage.toFixed(2)}%`,
        attacksUsed: `${clanAttacks}/${totalPossibleAttacks} vs ${opponentAttacks}/${totalPossibleAttacks}`,
        warType: this.warType
    };
};

module.exports = mongoose.model('WarHistory', warHistorySchema);