/**
 * Utility functions for input validation
 */

/**
 * Validate a Clash of Clans tag
 * @param {string} tag - The tag to validate
 * @returns {Object} Validation result
 */
function validateTag(tag) {
    if (!tag) {
        return {
            valid: false,
            message: 'Tag is required'
        };
    }

    // Trim whitespace that might be present in the input
    const trimmedTag = tag.trim();

    // Remove # if present
    const formattedTag = trimmedTag.startsWith('#') ? trimmedTag.substring(1) : trimmedTag;

    // CoC tags only use certain characters (0-9, PYLQGRJCUV)
    const validTagPattern = /^[0289PYLQGRJCUV]+$/i;

    if (!validTagPattern.test(formattedTag)) {
        return {
            valid: false,
            message: 'Invalid tag format. Clash of Clans tags only use certain letters and numbers (0-9, PYLQGRJCUV).'
        };
    }

    // Tag should be between 3 and 9 characters after removing #
    if (formattedTag.length < 3 || formattedTag.length > 9) {
        return {
            valid: false,
            message: 'Tag length is invalid. Clash of Clans tags are between 3 and 9 characters.'
        };
    }

    return {
        valid: true,
        formattedTag: '#' + formattedTag.toUpperCase(),
        rawTag: formattedTag.toUpperCase()  // Also return the raw tag without #
    };
}

/**
 * Validate search parameters for clan search
 * @param {Object} params - Search parameters
 * @returns {Object} Validated and sanitized parameters
 */
function validateClanSearchParams(params) {
    const validParams = {};
    const errors = [];

    // Name validation
    if (params.name) {
        if (typeof params.name === 'string' && params.name.length >= 3) {
            validParams.name = params.name;
        } else {
            errors.push('Clan name must be at least 3 characters');
        }
    }

    // War frequency validation
    if (params.warFrequency) {
        const validFrequencies = ['always', 'moreThanOncePerWeek', 'oncePerWeek', 'lessThanOncePerWeek', 'never', 'unknown'];
        if (validFrequencies.includes(params.warFrequency.toLowerCase())) {
            validParams.warFrequency = params.warFrequency.toLowerCase();
        } else {
            errors.push('Invalid war frequency');
        }
    }

    // Location validation
    if (params.locationId && !isNaN(parseInt(params.locationId))) {
        validParams.locationId = parseInt(params.locationId);
    }

    // Min/max members validation
    if (params.minMembers && !isNaN(parseInt(params.minMembers)) && parseInt(params.minMembers) >= 1) {
        validParams.minMembers = parseInt(params.minMembers);
    }

    if (params.maxMembers && !isNaN(parseInt(params.maxMembers)) && parseInt(params.maxMembers) <= 50) {
        validParams.maxMembers = parseInt(params.maxMembers);
    }

    // Min/max clan points validation
    if (params.minClanPoints && !isNaN(parseInt(params.minClanPoints))) {
        validParams.minClanPoints = parseInt(params.minClanPoints);
    }

    // Min/max clan level validation
    if (params.minClanLevel && !isNaN(parseInt(params.minClanLevel)) && parseInt(params.minClanLevel) >= 1) {
        validParams.minClanLevel = parseInt(params.minClanLevel);
    }

    // Limit validation (prevent excessive API usage)
    if (params.limit && !isNaN(parseInt(params.limit))) {
        validParams.limit = Math.min(parseInt(params.limit), 25); // Cap at 25 results
    } else {
        validParams.limit = 10; // Default to 10 results
    }

    return {
        params: validParams,
        errors: errors.length > 0 ? errors : null
    };
}

/**
 * Format a discord channel ID from a channel mention or ID
 * @param {string} channelInput - Raw channel input
 * @returns {string|null} Formatted channel ID or null if invalid
 */
function formatChannelId(channelInput) {
    if (!channelInput) return null;

    // If it's already just an ID
    if (/^\d{17,19}$/.test(channelInput)) {
        return channelInput;
    }

    // If it's a channel mention (<#ID>)
    const match = channelInput.match(/^<#(\d{17,19})>$/);
    if (match) {
        return match[1];
    }

    return null;
}

module.exports = {
    validateTag,
    validateClanSearchParams,
    formatChannelId
};