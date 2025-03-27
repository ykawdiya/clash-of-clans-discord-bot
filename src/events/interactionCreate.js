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

        client.on('debug', (debugInfo) => {
            // Only log important debug info to prevent console spam
            if (debugInfo.includes('ERROR') || debugInfo.includes('WARN')) {
                console.log('Discord debug:', debugInfo);
            }
        });

        console.log('Added additional error and debug listeners to client');
    },

    async execute(client, interaction) {
        // Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            console.log(`Modal submitted: ${interaction.customId}`);

            // Handle recruitment application
            if (interaction.customId === 'recruitment_application') {
                try {
                    const recruitmentCommand = require('../commands/recruitment/recruit');
                    if (recruitmentCommand.handleApplicationSubmit) {
                        await recruitmentCommand.handleApplicationSubmit(interaction);
                    } else {
                        console.error('handleApplicationSubmit function not found in recruit.js');
                        await interaction.reply({
                            content: 'Error processing your application. Please contact an administrator.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error handling application submission:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'Error processing your application. Please try again later.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
                return;
            }

            // Handle other modal submissions here
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
                    } else {
                        console.warn('handleRecruitmentButton function not found');
                    }
                } catch (error) {
                    console.error('Error handling recruitment button:', error);
                }
            }

            // Continue with other button handlers...
        }

        // Skip if not a command interaction
        if (!interaction.isChatInputCommand()) return;

        // Start a timer to track execution time
        const startTime = Date.now();

        // Log key interaction details
        console.log('--- Command Interaction Received ---');
        console.log(`Command Name: ${interaction.commandName}`);
        console.log(`User: ${interaction.user.tag} (${interaction.user.id})`);
        console.log(`Guild: ${interaction.guild ? interaction.guild.name : 'DM'}`);

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`❌ No command matching ${interaction.commandName} was found.`);
            console.log('Available Commands:', Array.from(client.commands.keys()).join(', '));

            try {
                return await interaction.reply({
                    content: `Command not found. Please try one of these: ${Array.from(client.commands.keys()).join(', ')}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Failed to reply to unknown command:', error);
                return;
            }
        }

        // Rest of the original function remains the same...

        // Check if command requires database and if database is available
        if (command.requiresDatabase && !client.databaseAvailable) {
            try {
                return await interaction.reply({
                    content: 'This command requires database access, which is currently unavailable. Please try again later.',
                    ephemeral: true
                });
            } catch (error) {
                console.error('Failed to reply with database unavailable message:', error);
                return;
            }
        }

        try {
            console.log(`Executing command: ${interaction.commandName}`);

            // Track command usage at the start
            statusMonitor.trackCommand(interaction.commandName);

            // Important: Add a flag to the interaction to track whether we've deferred already
            interaction._wasDeferred = false;

            // Only auto-defer if the command doesn't handle it on its own
            if (!command.manualDeferring && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferReply();
                    interaction._wasDeferred = true; // Mark that we've deferred
                    console.log(`Auto-deferred reply for ${interaction.commandName}`);
                } catch (deferError) {
                    // Just log and continue if deferring fails
                    console.warn(`Could not auto-defer for ${interaction.commandName}:`, deferError.message);
                }
            }

            // Execute the command with a safe interaction wrapper
            try {
                const safeInteraction = createSafeInteraction(interaction);
                await command.execute(safeInteraction);
            } catch (execError) {
                throw execError; // Re-throw to be caught by our outer try/catch
            }

            // Log execution time
            const executionTime = Date.now() - startTime;
            console.log(`✅ Command ${interaction.commandName} completed in ${executionTime}ms`);

            // Track successful command execution
            statusMonitor.trackCommand(interaction.commandName, true, null, executionTime);

        } catch (error) {
            console.error(`❌ Error executing ${interaction.commandName}:`, error);
            console.error('Error Stack:', error.stack || 'No stack trace available');

            // Track failed command execution
            statusMonitor.trackCommand(interaction.commandName, false, error);

            // Provide specific error messages for common issues
            let userErrorMessage = 'Sorry, an error occurred while executing this command.';

            if (error.message) {
                if (error.message.includes('database') || error.message.includes('mongo')) {
                    userErrorMessage = 'Database connection error. Please try again later.';
                } else if (error.message.includes('API') || error.message.includes('timeout')) {
                    userErrorMessage = 'The Clash of Clans API is currently unavailable. Please try again later.';
                } else {
                    userErrorMessage = `Error: ${error.message}`;
                }
            }

            try {
                // Respond based on the current interaction state
                if (interaction.replied) {
                    await interaction.followUp({
                        content: userErrorMessage,
                        ephemeral: true
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: userErrorMessage
                    });
                } else {
                    await interaction.reply({
                        content: userErrorMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message to user:', replyError);
            }
        }
    },
};

/**
 * Creates a safe wrapper around an interaction to prevent duplicate replies
 */
function createSafeInteraction(interaction) {
    // Function remains the same...
    // Create a proxy that wraps all interaction methods with error handling
    return new Proxy(interaction, {
        get(target, prop) {
            // If accessing a property that's not a method, return it directly
            if (typeof target[prop] !== 'function') {
                return target[prop];
            }

            // Wrap methods with additional checks
            return async function(...args) {
                // For reply/deferReply, check if already replied/deferred
                if ((prop === 'reply' || prop === 'deferReply') &&
                    (target.replied || target.deferred)) {
                    console.warn(`Prevented duplicate ${prop} for command ${target.commandName}`);

                    // For reply, try to use followUp instead
                    if (prop === 'reply') {
                        try {
                            return await target.followUp(...args);
                        } catch (e) {
                            console.warn(`Failed to convert reply to followUp: ${e.message}`);
                            return null;
                        }
                    }
                    return null;
                }

                try {
                    // Call the original method
                    return await target[prop](...args);
                } catch (error) {
                    // If the error is about already replied/deferred
                    if (error.message && error.message.includes('already been')) {
                        console.warn(`Error in ${prop}: ${error.message}`);

                        // Try a fallback for common methods
                        if (prop === 'reply') {
                            try {
                                return await target.followUp(...args);
                            } catch (fallbackError) {
                                console.warn(`Fallback also failed: ${fallbackError.message}`);
                            }
                        }
                    } else {
                        // Rethrow other errors
                        throw error;
                    }
                    return null;
                }
            };
        }
    });
}