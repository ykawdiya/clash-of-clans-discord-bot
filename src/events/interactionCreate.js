const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,

    // Add initialize method to set up client listeners
    initialize(client) {
        // Add client-level event listeners
        client.on('error', (error) => {
            console.error('Discord client error:', error);
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

        try {
            console.log(`Executing command: ${interaction.commandName}`);

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

            // Execute the command
            try {
                // Create a wrapper around the interaction to prevent duplicate replies
                const safeInteraction = createSafeInteraction(interaction);
                await command.execute(safeInteraction);
            } catch (execError) {
                throw execError; // Re-throw to be caught by our outer try/catch
            }

            // Log execution time
            const executionTime = Date.now() - startTime;
            console.log(`✅ Command ${interaction.commandName} completed in ${executionTime}ms`);
        } catch (error) {
            console.error(`❌ Error executing ${interaction.commandName}:`, error);
            console.error('Error Stack:', error.stack || 'No stack trace available');

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
    // Create a proxy that wraps all interaction methods with error handling
    return new Proxy(interaction, {
        get(target, prop) {
            // If accessing a property that's not a method, return it directly
            if (typeof target[prop] !== 'function') {
                return target[prop];
            }

            // Wrap methods with additional checks
            return async function(...args) {
                if ((prop === 'reply' || prop === 'deferReply') &&
                    (target.replied || target.deferred || target._wasDeferred)) {
                    // If attempting to reply/defer when already replied/deferred, log and skip
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
                    if (error.message.includes('already been sent')) {
                        console.warn(`Error in ${prop}: ${error.message}`);

                        // Try a fallback for common methods
                        if (prop === 'reply') {
                            try {
                                return await target.followUp(...args);
                            } catch (fallbackError) {
                                console.warn(`Fallback also failed: ${fallbackError.message}`);
                                return null;
                            }
                        } else if (prop === 'deferReply') {
                            // Just mark it as deferred and continue
                            target._wasDeferred = true;
                            return null;
                        }
                    }

                    // Rethrow other errors
                    throw error;
                }
            };
        }
    });
}