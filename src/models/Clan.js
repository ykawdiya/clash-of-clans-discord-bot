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
            ,
            // Added role type fields
            townHall: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            },
            warActivity: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            },
            donationTier: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            }
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

// Static method to get primary clan for a guild
clanSchema.statics.getPrimaryClan = async function(guildId) {
    const primaryClan = await this.findOne({ guildId, isPrimary: true });
    if (primaryClan) return primaryClan;

    // If no primary clan is set, get the first clan registered and set it as primary
    const firstClan = await this.findOne({ guildId }).sort({ createdAt: 1 });
    if (firstClan) {
        firstClan.isPrimary = true;
        await firstClan.save();
        return firstClan;
    }

    return null;
};

// Add an index for quicker lookups by guild ID
clanSchema.index({ guildId: 1 });

// Add a compound index for efficient queries
clanSchema.index({ clanTag: 1, guildId: 1 });

module.exports = mongoose.model('Clan', clanSchema);