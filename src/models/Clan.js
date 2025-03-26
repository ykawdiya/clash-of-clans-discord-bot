const mongoose = require('mongoose');

const clanSchema = new mongoose.Schema({
    // Clan tag from CoC
    clanTag: {
        type: String,
        required: [true, 'Clan tag is required'],
        unique: true,
        trim: true,
        validate: {
            validator: function(v) {
                // Validate tag format (starts with # and contains valid characters)
                return /^#[0289PYLQGRJCUV]+$/i.test(v);
            },
            message: props => `${props.value} is not a valid clan tag!`
        }
    },

    // Clan name
    name: {
        type: String,
        required: [true, 'Clan name is required']
    },

    // Discord server ID where this clan is registered
    guildId: {
        type: String,
        required: [true, 'Guild ID is required'],
        index: true
    },

    // Clan description/information
    description: String,

    // Clan settings for the bot
    settings: {
        // Channels for different notifications
        channels: {
            warAnnouncements: {
                type: String,
                default: null
            },
            raidWeekend: {
                type: String,
                default: null
            },
            clanGames: {
                type: String,
                default: null
            },
            general: {
                type: String,
                default: null
            }
        },

        // Role IDs for mentions
        roles: {
            everyone: {
                type: String,
                default: null
            },
            elder: {
                type: String,
                default: null
            },
            coLeader: {
                type: String,
                default: null
            },
            leader: {
                type: String,
                default: null
            }
        },

        // Automatic notifications
        notifications: {
            warStart: {
                type: Boolean,
                default: true
            },
            warEnd: {
                type: Boolean,
                default: true
            },
            cwlStart: {
                type: Boolean,
                default: true
            },
            clanGamesStart: {
                type: Boolean,
                default: true
            },
            raidWeekendStart: {
                type: Boolean,
                default: true
            }
        }
    },

    // War history (recent wars)
    warHistory: [{
        opponentName: String,
        opponentTag: String,
        startTime: Date,
        endTime: Date,
        result: {
            type: String,
            enum: ['win', 'lose', 'tie', 'ongoing']
        },
        stars: Number,
        destruction: Number,
        enemyStars: Number,
        enemyDestruction: Number
    }],

    // When the clan was registered
    createdAt: {
        type: Date,
        default: Date.now
    },

    // Last time the clan data was updated
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
clanSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Add a pre-update hook for findOneAndUpdate
clanSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

// Add an index for quicker lookups by guild ID
clanSchema.index({ guildId: 1 });

// Add a compound index for efficient queries
clanSchema.index({ clanTag: 1, guildId: 1 });

module.exports = mongoose.model('Clan', clanSchema);