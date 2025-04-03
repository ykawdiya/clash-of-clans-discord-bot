// src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Discord information
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  discordUsername: {
    type: String,
    required: true
  },

  // Player information
  playerTag: {
    type: String,
    required: true,
    unique: true
  },
  playerName: {
    type: String,
    required: true
  },
  townHallLevel: {
    type: Number,
    required: true
  },

  // Roles and permissions
  roles: {
    type: [String],
    default: []
  },

  // Tracking statistics
  warStats: {
    attacksMade: { type: Number, default: 0 },
    starsEarned: { type: Number, default: 0 },
    totalDestruction: { type: Number, default: 0 },
    perfectAttacks: { type: Number, default: 0 },
    missedAttacks: { type: Number, default: 0 }
  },
  cwlStats: {
    seasonsParticipated: { type: Number, default: 0 },
    attacksMade: { type: Number, default: 0 },
    starsEarned: { type: Number, default: 0 },
    totalDestruction: { type: Number, default: 0 },
    perfectAttacks: { type: Number, default: 0 },
    missedAttacks: { type: Number, default: 0 }
  },
  capitalStats: {
    raidWeekends: { type: Number, default: 0 },
    attacksMade: { type: Number, default: 0 },
    districtsDestroyed: { type: Number, default: 0 },
    capitalGoldContributed: { type: Number, default: 0 },
    capitalGoldLooted: { type: Number, default: 0 }
  },

  // Settings and preferences
  settings: {
    warReminders: { type: Boolean, default: true },
    cwlReminders: { type: Boolean, default: true },
    raidReminders: { type: Boolean, default: true },
    receiveUpdates: { type: Boolean, default: true }
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
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);