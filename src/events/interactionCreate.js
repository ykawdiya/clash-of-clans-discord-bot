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

            return interaction.reply({
                content: `Command not found. Please try one of these: ${Array.from(client.commands.keys()).join(', ')}`,
                ephemeral: true
            }).catch(error => {
                console.error('Failed to reply to unknown command:', error);
            });
        }

        try {
            console.log(`Executing command: ${interaction.commandName}`);

            // IMPORTANT: Remove auto-deferring - let commands handle their own deferring
            // Do NOT add any interaction.deferReply() here

            // Execute the command
            await command.execute(interaction);

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
                    }).catch(e => console.error('Could not send followUp:', e));
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: userErrorMessage
                    }).catch(e => console.error('Could not edit reply:', e));
                } else {
                    await interaction.reply({
                        content: userErrorMessage,
                        ephemeral: true
                    }).catch(e => console.error('Could not reply:', e));
                }
            } catch (replyError) {
                console.error('Failed to send error message to user:', replyError);
            }
        }
    },
};