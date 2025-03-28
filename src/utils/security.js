// src/utils/security.js
const crypto = require('crypto');
const { system: log } = require('./logger');

/**
 * Security utilities for the bot
 */
class Security {
    /**
     * Generate a secure random token
     * @param {number} length - Length of the token
     * @returns {string} Random token
     */
    static generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash a string using SHA-256
     * @param {string} input - String to hash
     * @returns {string} Hashed string
     */
    static hashString(input) {
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    /**
     * Encrypt sensitive data
     * @param {string} text - Text to encrypt
     * @param {string} key - Encryption key
     * @returns {string} Encrypted data
     */
    static encrypt(text, key = process.env.ENCRYPTION_KEY) {
        if (!key) throw new Error('Encryption key is required');
        if (!text) return '';

        try {
            // Generate random initialization vector
            const iv = crypto.randomBytes(16);

            // Create cipher using AES-256-CBC
            const cipher = crypto.createCipheriv(
                'aes-256-cbc',
                crypto.createHash('sha256').update(key).digest(),
                iv
            );

            // Encrypt the text
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Return IV + encrypted data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            log.error('Encryption failed', { error: error.message });
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt sensitive data
     * @param {string} encrypted - Encrypted data
     * @param {string} key - Encryption key
     * @returns {string} Decrypted text
     */
    static decrypt(encrypted, key = process.env.ENCRYPTION_KEY) {
        if (!key) throw new Error('Encryption key is required');
        if (!encrypted) return '';

        try {
            // Split IV and encrypted data
            const parts = encrypted.split(':');
            if (parts.length !== 2) throw new Error('Invalid encrypted data format');

            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];

            // Create decipher
            const decipher = crypto.createDecipheriv(
                'aes-256-cbc',
                crypto.createHash('sha256').update(key).digest(),
                iv
            );

            // Decrypt the data
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            log.error('Decryption failed', { error: error.message });
            return ''; // Return empty string on failure for safety
        }
    }

    /**
     * Sanitize user input to prevent injection attacks
     * @param {string} input - User input to sanitize
     * @returns {string} Sanitized input
     */
    static sanitizeInput(input) {
        if (!input) return '';

        // Convert to string if not already
        input = String(input);

        // Replace HTML/XML tags
        input = input.replace(/<[^>]*>/g, '');

        // Replace potentially dangerous characters
        input = input.replace(/[;\\\n\r\u2028\u2029]/g, '');

        return input.trim();
    }

    /**
     * Validate permissions for a command
     * @param {object} member - Discord guild member
     * @param {array} requiredPermissions - Required permissions
     * @returns {boolean} Whether the member has the required permissions
     */
    static hasPermissions(member, requiredPermissions) {
        if (!member || !requiredPermissions) return false;

        return requiredPermissions.every(permission => member.permissions.has(permission));
    }

    /**
     * Validate a user's role for a command
     * @param {object} member - Discord guild member
     * @param {array} roleNames - Required role names
     * @returns {boolean} Whether the member has any of the required roles
     */
    static hasRole(member, roleNames) {
        if (!member || !roleNames || !Array.isArray(roleNames)) return false;

        return member.roles.cache.some(role =>
            roleNames.includes(role.name) || roleNames.includes(role.id)
        );
    }

    /**
     * Rate limit tracker for commands
     */
    static commandRateLimits = new Map();

    /**
     * Check if a user is rate limited for a command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {number} limit - Number of uses allowed in the time window
     * @param {number} windowMs - Time window in milliseconds
     * @returns {object} Rate limit status
     */
    static checkRateLimit(userId, commandName, limit = 5, windowMs = 60000) {
        const key = `${userId}:${commandName}`;
        const now = Date.now();

        // Get or create user's rate limit entry
        if (!this.commandRateLimits.has(key)) {
            this.commandRateLimits.set(key, {
                timestamps: [],
                blocked: false,
                blockedUntil: 0
            });
        }

        const userRateLimit = this.commandRateLimits.get(key);

        // If user is blocked, check if block has expired
        if (userRateLimit.blocked) {
            if (now >= userRateLimit.blockedUntil) {
                // Block expired, reset
                userRateLimit.blocked = false;
                userRateLimit.timestamps = [];
            } else {
                // Still blocked
                return {
                    limited: true,
                    remaining: 0,
                    resetTime: userRateLimit.blockedUntil,
                    waitMs: userRateLimit.blockedUntil - now
                };
            }
        }

        // Filter out timestamps outside the window
        userRateLimit.timestamps = userRateLimit.timestamps.filter(
            timestamp => now - timestamp < windowMs
        );

        // Check if limit is exceeded
        if (userRateLimit.timestamps.length >= limit) {
            // Block for twice the window time
            userRateLimit.blocked = true;
            userRateLimit.blockedUntil = now + (windowMs * 2);

            log.warn('Rate limit exceeded', { userId, commandName, limit });

            return {
                limited: true,
                remaining: 0,
                resetTime: userRateLimit.blockedUntil,
                waitMs: windowMs * 2
            };
        }

        // Add current timestamp and return status
        userRateLimit.timestamps.push(now);

        return {
            limited: false,
            remaining: limit - userRateLimit.timestamps.length,
            resetTime: now + windowMs,
            waitMs: 0
        };
    }

    /**
     * Clean up old rate limit entries
     */
    static cleanupRateLimits() {
        const now = Date.now();

        for (const [key, value] of this.commandRateLimits.entries()) {
            // If blocked and block expired, or all timestamps are old, remove the entry
            if ((value.blocked && now >= value.blockedUntil) ||
                (value.timestamps.length === 0 || value.timestamps[value.timestamps.length - 1] < now - 3600000)) {
                this.commandRateLimits.delete(key);
            }
        }
    }

    // Start periodic cleanup
    static startCleanupInterval() {
        setInterval(() => this.cleanupRateLimits(), 3600000); // Every hour
    }
}

// Start rate limit cleanup
Security.startCleanupInterval();

module.exports = Security;