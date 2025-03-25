// src/utils/errorHandler.js

const { EmbedBuilder } = require('discord.js');

/**
 * Centralized error handling for commands
 */
class ErrorHandler {
    /**
     * Create a user-friendly error response
     * @param {Error} error - The error object
     * @param {string} context - Context where the error occurred
     * @returns {Object} Formatted error message and embed
     */
    static formatError(error, context = 'command') {
        // Default values
        let title = 'Error';
        let description = 'An unexpected error occurred.';
        let color = 0xed4245; // Discord red
        let fields = [];

        // Determine specific error type and customize response
        if (error.response) {
            // API response errors
            const status = error.response.status;

            if (status === 404) {
                title = 'Not Found';
                description = `The requested ${context} was not found.`;
                fields.push({ name: 'Suggestion', value: 'Check the tag and try again.' });
            } else if (status === 403) {
                title = 'API Access Denied';
                description = 'Cannot access the Clash of Clans API.';
                fields.push({ name: 'Possible Reasons', value: 'IP whitelisting issue or invalid API key.' });
            } else if (status === 429) {
                title = 'Rate Limited';
                description = 'Too many requests to the Clash of Clans API.';
                fields.push({ name: 'Solution', value: 'Please try again in a few minutes.' });
            } else if (status === 503) {
                title = 'API Unavailable';
                description = 'The Clash of Clans API is currently unavailable.';
                fields.push({ name: 'Solution', value: 'Please try again later.' });
            } else {
                title = `API Error (${status})`;
                description = 'An error occurred while communicating with the Clash of Clans API.';
            }
            console.error(`[Error ID: ${errorId}] API Error [${status}]:`, error.response.data || 'No response data');
        } else if (error.message && error.message.includes('timed out')) {
            title = 'Request Timeout';
            description = 'The request to the Clash of Clans API timed out.';
            fields.push({ name: 'Solution', value: 'Please try again later.' });
        } else if (error.message && error.message.includes('no response')) {
            title = 'No Response';
            description = 'No response received from the Clash of Clans API.';
            fields.push({ name: 'Solution', value: 'The API might be down. Please try again later.' });
        } else if (error.message && error.message.includes('validation')) {
            title = 'Invalid Input';
            description = 'The provided input is invalid.';
            fields.push({ name: 'Solution', value: 'Check your input and try again.' });
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            title = 'Connection Error';
            description = 'Could not connect to the Clash of Clans API.';
            fields.push({ name: 'Solution', value: 'Please try again later.' });
        } else if (error.code === 'ECONNRESET') {
            title = 'Connection Reset';
            description = 'The connection to the Clash of Clans API was reset.';
            fields.push({ name: 'Solution', value: 'Try again in a few seconds.' });
        }

        // Create error embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Add footer with error ID for tracking
        const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        embed.setFooter({ text: `Error ID: ${errorId}` });

        // Log error for debugging with error ID reference
        console.error(`[Error ID: ${errorId}] ${context} error:\n`, error.stack || error);

        return {
            embeds: [embed],
            ephemeral: true
        };
    }

    /**
     * Handle database errors
     * @param {Error} error - Database error
     * @returns {string} User-friendly error message
     */
    static handleDatabaseError(error) {
        // Log the original error for debugging
        console.error('Database error:', error);

        if (error.name === 'MongoNetworkError') {
            return 'Could not connect to the database. Please try again later.';
        } else if (error.name === 'ValidationError') {
            return 'There was an issue with the data format. Please check your input.';
        } else if (error.code === 11000) {
            return 'This record already exists.';
        } else {
            return 'A database error occurred. Please try again later.';
        }
    }

    /**
     * Create a success response
     * @param {string} title - Success title
     * @param {string} description - Success description
     * @returns {Object} Formatted success embed
     */
    static successResponse(title, description) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x57f287) // Discord green
            .setTimestamp();

        return { embeds: [embed] };
    }
}

module.exports = ErrorHandler;