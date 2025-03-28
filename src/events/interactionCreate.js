const { Events } = require('discord.js');
const statusMonitor = require('../utils/statusMonitor');

module.exports = {
    name: Events.InteractionCreate,

    // Add initialize method to set up client listeners
    initialize(client) {
        // Add client-level event listeners
        client.on('error', (error) => {
            console.error('Discord client error:', error);
            statusMonitor.recordError('client', 'discord_client', error);
        });

        // Only log critical debug info to reduce console clutter
        client.on('debug', (debugInfo) => {
            if (debugInfo.includes('ERROR') || debugInfo.includes('WARN')) {
                console.log('Discord debug:', debugInfo);
            }
        });

        console.log('Added error and debug listeners to client');
    },

    async execute(client, interaction) {
        // Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            console.log(`Modal submitted: ${interaction.customId}`);

            if (interaction.customId === 'recruitment_application') {
                try {
                    const recruitmentCommand = require('../commands/recruitment/recruit');
                    if (recruitmentCommand.handleApplicationSubmit) {
                        await recruitmentCommand.handleApplicationSubmit(interaction);
                    } else {
                        console.error('handleApplicationSubmit function not found');
                        await interaction.reply({
                            content: 'Error processing your application. Please contact an administrator.',
                            ephemeral: true
                        }).catch(() => {});
                    }
                } catch (error) {
                    console.error('Error handling application submission:', error);
                    this._safeReply(interaction, 'Error processing your application. Please try again later.');
                }
                return;
            }
        }

        // Handle Button/Select Menu interactions
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            // Check for recruitment-related interactions
            if (interaction.customId.startsWith('apply_') ||
                interaction.customId.startsWith('approve_') ||
                interaction.customId.startsWith('reject_') ||
                interaction.customId.startsWith('waitlist_') ||
                interaction.customId.startsWith('view_') ||
                interaction.customId === 'apply_button') {

                try {
                    const recruitmentCommand = require('../commands/recruitment/recruit');
                    if (recruitmentCommand.handleRecruitmentButton) {
                        const handled = await recruitmentCommand.handleRecruitmentButton(interaction);
                        if (handled) return;
                    }
                } catch (error) {
                    console.error('Error handling recruitment button:', error);
                }
            }
        }

        // Skip if not a command interaction
        if (!interaction.isChatInputCommand()) return;

        // Start a timer to track execution time
        const startTime = Date.now();
        console.log(`Command received: ${interaction.commandName} from ${interaction.user.tag}`);

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            this._safeReply(interaction, `Command not found. Try one of these: ${Array.from(client.commands.keys()).slice(0, 5).join(', ')}...`);
            return;
        }

        // Check if command requires database and if database is available
        if (command.requiresDatabase && !client.databaseAvailable) {
            this._safeReply(interaction, 'This command requires database access, which is currently unavailable. Please try again later.');
            return;
        }

        try {
            // Track command usage
            statusMonitor.trackCommand(interaction.commandName);

            // Auto-defer if needed
            if (!command.manualDeferring && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferReply();
                    interaction._wasDeferred = true;
                } catch (deferError) {
                    console.warn(`Could not auto-defer for ${interaction.commandName}:`, deferError.message);
                }
            }

            // Execute the command with safety wrapper
            const safeInteraction = this._createSafeInteraction(interaction);
            await command.execute(safeInteraction);

            // Log success
            const executionTime = Date.now() - startTime;
            console.log(`Command ${interaction.commandName} completed in ${executionTime}ms`);
            statusMonitor.trackCommand(interaction.commandName, true, null, executionTime);

        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            statusMonitor.trackCommand(interaction.commandName, false, error);

            // Prepare user-friendly error message
            let userErrorMessage = 'An error occurred while executing this command.';
            if (error.message) {
                if (error.message.includes('database') || error.message.includes('mongo')) {
                    userErrorMessage = 'Database connection error. Please try again later.';
                } else if (error.message.includes('API') || error.message.includes('timeout')) {
                    userErrorMessage = 'The Clash of Clans API is currently unavailable. Please try again later.';
                } else {
                    userErrorMessage = `Error: ${error.message}`;
                }
            }

            // Send error response based on interaction state
            this._safeReply(interaction, userErrorMessage);
        }
    },

    // Safely reply to an interaction based on its current state
    _safeReply(interaction, message, ephemeral = true) {
        try {
            if (interaction.replied) {
                interaction.followUp({ content: message, ephemeral }).catch(() => {});
            } else if (interaction.deferred) {
                interaction.editReply({ content: message }).catch(() => {});
            } else {
                interaction.reply({ content: message, ephemeral }).catch(() => {});
            }
        } catch (error) {
            console.error('Error sending reply:', error);
        }
    },

    // Create a safe wrapper around interaction methods
    _createSafeInteraction(interaction) {
        return new Proxy(interaction, {
            get(target, prop) {
                if (typeof target[prop] !== 'function') {
                    return target[prop];
                }

                return async function(...args) {
                    if ((prop === 'reply' || prop === 'deferReply') &&
                        (target.replied || target.deferred)) {
                        if (prop === 'reply') {
                            try {
                                return await target.followUp(...args);
                            } catch (e) {
                                console.warn(`Failed to convert reply to followUp: ${e.message}`);
                            }
                        }
                        return null;
                    }

                    try {
                        return await target[prop](...args);
                    } catch (error) {
                        if (error.message && error.message.includes('already been')) {
                            console.warn(`Error in ${prop}: ${error.message}`);
                            if (prop === 'reply') {
                                try {
                                    return await target.followUp(...args);
                                } catch (fallbackError) {
                                    console.warn(`Fallback failed: ${fallbackError.message}`);
                                }
                            }
                        } else {
                            throw error;
                        }
                        return null;
                    }
                };
            }
        });
    }
};