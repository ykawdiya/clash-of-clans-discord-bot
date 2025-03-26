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
        // Start a timer to track execution time
        const startTime = Date.now();

        // Log all details about the interaction
        console.log('--- Interaction Received ---');
        console.log(`Type: ${interaction.type}`);
        console.log(`Is Chat Input Command: ${interaction.isChatInputCommand()}`);

        if (interaction.isChatInputCommand()) {
            console.log(`Command Name: ${interaction.commandName}`);
        }

        console.log(`User: ${interaction.user.tag} (${interaction.user.id})`);
        console.log(`Guild: ${interaction.guild ? interaction.guild.name : 'DM'}`);

        if (!interaction.isChatInputCommand()) {
            console.log('Not a chat input command, ignoring.');
            return;
        }

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`❌ No command matching ${interaction.commandName} was found.`);

            // Log all available commands in the client
            console.log('Available Commands:');
            client.commands.forEach((cmd, name) => {
                console.log(`- ${name}`);
            });

            return interaction.reply({
                content: `Command not found. Available commands: ${Array.from(client.commands.keys()).join(', ')}`,
                ephemeral: true
            }).catch(error => {
                console.error('Failed to reply to unknown command:', error);
            });
        }

        // Check if too much time has elapsed already (over 1.5 seconds)
        if (Date.now() - startTime > 1500) {
            console.warn(`⚠️ Command preparation took too long: ${Date.now() - startTime}ms`);
        }

        try {
            console.log(`Executing command: ${interaction.commandName}`);

            // For safety, try to defer right away to avoid timeouts
            // Only if the command doesn't already handle deferring
            if (!command.manualDeferring) {
                try {
                    await interaction.deferReply().catch(err => {
                        console.error('Failed to auto-defer reply:', err);
                        // If deferring fails, we can still continue with the command
                    });
                    console.log(`Auto-deferred reply for ${interaction.commandName}`);
                } catch (deferError) {
                    console.warn(`Could not auto-defer for ${interaction.commandName}, continuing anyway:`, deferError.message);
                }
            }

            // Execute the command
            await command.execute(interaction);

            // Log execution time
            const executionTime = Date.now() - startTime;
            console.log(`✅ Command ${interaction.commandName} completed in ${executionTime}ms`);

        } catch (error) {
            console.error(`❌ Error executing ${interaction.commandName}:`, error);

            // More detailed error logging
            if (error.stack) {
                console.error('Error Stack:', error.stack);
            }

            // Attempt to provide a helpful error message
            const errorMessage = error.message || 'An unknown error occurred';

            // Create a user-friendly error message
            const userErrorMessage = `Sorry, an error occurred while executing this command: ${errorMessage}`;

            try {
                // Handle different interaction states
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