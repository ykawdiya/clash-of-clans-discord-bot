const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        // Log all details about the interaction
        console.log('--- Interaction Received ---');
        console.log(`Type: ${interaction.type}`);
        console.log(`Is Chat Input Command: ${interaction.isChatInputCommand()}`);
        console.log(`Command Name: ${interaction.commandName}`);
        console.log(`User: ${interaction.user.tag} (${interaction.user.id})`);
        console.log(`Guild: ${interaction.guild ? interaction.guild.name : 'DM'}`)

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
            });
        }

        try {
            console.log(`Executing command: ${interaction.commandName}`);
            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Error executing ${interaction.commandName}:`, error);

            // More detailed error logging
            if (error.stack) {
                console.error('Error Stack:', error.stack);
            }

            // Attempt to provide a helpful error message
            const errorMessage = error.message || 'An unknown error occurred';

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: `Error executing command: ${errorMessage}`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `Error executing command: ${errorMessage}`,
                    ephemeral: true
                });
            }
        }
    },
};