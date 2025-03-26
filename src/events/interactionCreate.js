const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            // Check if this command requires database access
            if (command.requiresDatabase === true) {
                const databaseService = require('../services/databaseService');

                // Make sure we're connected to the database
                if (!databaseService.checkConnection()) {
                    console.log(`Database connection needed for ${interaction.commandName}, connecting...`);
                    try {
                        await databaseService.connect();
                    } catch (dbErr) {
                        console.error('Failed to connect to database:', dbErr);
                        return interaction.reply({
                            content: 'Unable to connect to the database. Please try again later.',
                            ephemeral: true
                        });
                    }
                }
            }

            // Execute the command
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            }
        }
    },
};