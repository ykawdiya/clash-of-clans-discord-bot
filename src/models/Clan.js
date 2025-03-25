const mongoose = require('mongoose');

const clanSchema = new mongoose.Schema({
    // Clan tag from CoC
    clanTag: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    // Clan name
    name: {
        type: String,
        required: true
    },

    // Discord server ID where this clan is registered
    guildId: {
        type: String,
        required: true
    },

    // Clan description/information
    description: String,

    // Clan settings for the bot
    settings: {
        // Channels for different notifications
        channels: {
            warAnnouncements: String,
            raidWeekend: String,
            clanGames: String,
            general: String
        },

        // Role IDs for mentions
        roles: {
            everyone: String,
            elder: String,
            coLeader: String,
            leader: String
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

module.exports = mongoose.model('Clan', clanSchema);