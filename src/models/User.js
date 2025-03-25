const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord user ID
    discordId: {
        type: String,
        required: true,
        unique: true
    },

    // Clash of Clans player tag
    playerTag: {
        type: String,
        trim: true,
        validate: {
            validator: tag => tag.length > 0,
            message: 'Player tag cannot be empty.'
        }
    },

    // Is the user verified (linked their CoC account)
    isVerified: {
        type: Boolean,
        default: false
    },

    // User preferences
    preferences: {
        warNotifications: {
            type: Boolean,
            default: true
        },
        clanGamesReminders: {
            type: Boolean,
            default: true
        },
        raidWeekendReminders: {
            type: Boolean,
            default: true
        }
    },

    // Additional tracked player tags (e.g. alt accounts)
    additionalTags: [{
        playerTag: {
            type: String,
            required: true,
            trim: true
        },
        nickname: {
            type: String,
            required: true,
            trim: true
        }
    }],

    // When the user was registered
    createdAt: {
        type: Date,
        default: Date.now
    },

    // Last time the user's data was updated
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Update the updatedAt timestamp before findOneAndUpdate
userSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

module.exports = mongoose.model('User', userSchema);