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

    // Whether this is the primary clan for the guild
    isPrimary: {
        type: Boolean,
        default: false
    },

    // Family/Alliance identifier for multi-clan support
    familyId: {
        type: String,
        index: true
    },

    // Clan type/purpose (e.g., "Main", "Feeder", "War", "Casual", "CWL")
    clanType: {
        type: String,
        enum: ['Main', 'Feeder', 'War', 'Casual', 'CWL', 'Other'],
        default: 'Main'
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

    // If this clan is being set as primary, make sure no other clan for this guild is primary
    if (this.isPrimary) {
        this.constructor.updateMany(
            {
                guildId: this.guildId,
                _id: { $ne: this._id }
            },
            {
                $set: { isPrimary: false }
            }
        ).catch(err => console.error('Error updating other clan isPrimary flags:', err));
    }

    next();
});

// Add a pre-update hook for findOneAndUpdate
clanSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });

    // If this clan is being set as primary via update
    if (this._update && this._update.$set && this._update.$set.isPrimary === true) {
        const clanId = this.getQuery()._id;
        const guildId = this._conditions.guildId || this._update.$set.guildId;

        if (guildId) {
            this.model.updateMany(
                {
                    guildId: guildId,
                    _id: { $ne: clanId }
                },
                {
                    $set: { isPrimary: false }
                }
            ).catch(err => console.error('Error updating other clan isPrimary flags:', err));
        }
    }

    next();
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

// Static method to get all clans for a guild
clanSchema.statics.getGuildClans = async function(guildId) {
    return this.find({ guildId }).sort({ isPrimary: -1, createdAt: 1 });
};

// Add an index for quicker lookups by guild ID
clanSchema.index({ guildId: 1 });

// Add a compound index for efficient queries
clanSchema.index({ clanTag: 1, guildId: 1 });

// Add index for family/alliance queries
clanSchema.index({ familyId: 1, clanType: 1 });

module.exports = mongoose.model('Clan', clanSchema);