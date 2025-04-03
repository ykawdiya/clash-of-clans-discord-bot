// src/models/WarTracking.js
const mongoose = require('mongoose');

const attackSchema = new mongoose.Schema({
  attackerTag: String,
  attackerName: String,
  attackerTownhallLevel: Number,
  defenderTag: String,
  defenderName: String,
  defenderTownhallLevel: Number,
  baseNumber: Number,
  stars: Number,
  destructionPercentage: Number,
  attackTime: Date
}, { _id: false });

const baseCallSchema = new mongoose.Schema({
  baseNumber: Number,
  calledBy: String,      // Discord ID
  calledByName: String,  // Discord username
  playerTag: String,     // CoC player tag if available
  timeReserved: Date,
  note: String,          // Optional attack plan note
  attacked: Boolean,
  attackResult: {
    stars: Number,
    percentage: Number
  }
}, { _id: false });

const memberSchema = new mongoose.Schema({
  playerTag: String,
  name: String,
  townhallLevel: Number,
  mapPosition: Number,
  attacks: [attackSchema],
  attacksUsed: {
    type: Number,
    default: 0
  },
  starsEarned: {
    type: Number,
    default: 0
  },
  averageDestruction: Number,
  bestAttackStars: Number,
  bestAttackPercentage: Number
}, { _id: false });

const warTrackingSchema = new mongoose.Schema({
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

  // War identification
  warId: {
    type: String,
    unique: true
  },

  // War status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  state: {
    type: String,
    enum: ['preparation', 'inWar', 'warEnded', 'notInWar'],
    default: 'preparation'
  },

  // Timing information
  preparationStartTime: Date,
  startTime: Date,
  endTime: Date,

  // Team information
  warSize: Number,
  opponent: {
    name: String,
    tag: String,
    level: Number,
    stars: {
      type: Number,
      default: 0
    },
    destruction: {
      type: Number,
      default: 0
    }
  },

  // Base calling system
  baseCalls: [baseCallSchema],

  // Attack tracking
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

  // Member performance
  members: [memberSchema],

  // War result
  result: {
    type: String,
    enum: ['win', 'lose', 'tie', 'ongoing'],
    default: 'ongoing'
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
warTrackingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
warTrackingSchema.index({ clanTag: 1, isActive: 1 });
warTrackingSchema.index({ guildId: 1, isActive: 1 });

module.exports = mongoose.model('WarTracking', warTrackingSchema);
