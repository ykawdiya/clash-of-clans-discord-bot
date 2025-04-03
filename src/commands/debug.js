// src/commands/debug.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug command to test bot functionality')
        .addSubcommand(subcommand =>
            subcommand
                .setName('basic')
                .setDescription('Basic response test'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissions')
                .setDescription('Test bot permissions'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('connection')
                .setDescription('Test database connection')),

    async execute(interaction) {
        try {
            // Always acknowledge the command immediately to prevent timeouts
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            // Different tests based on subcommand
            switch(subcommand) {
                case 'basic':
                    console.log('DEBUG: Basic test executed by', interaction.user.tag);
                    await interaction.editReply({
                        content: '✅ Basic test successful! Bot is responding to commands.'
                    });
                    break;

                case 'permissions':
                    console.log('DEBUG: Permissions test executed by', interaction.user.tag);

                    // Test bot permissions in the current channel
                    const permissions = interaction.guild.members.me.permissionsIn(interaction.channel);
                    const requiredPermissions = [
                        'ViewChannel',
                        'SendMessages',
                        'EmbedLinks',
                        'AttachFiles',
                        'ReadMessageHistory'
                    ];

                    const missingPermissions = requiredPermissions.filter(p => !permissions.has(p));

                    if (missingPermissions.length === 0) {
                        await interaction.editReply({
                            content: '✅ Permissions test successful! Bot has all required permissions in this channel.'
                        });
                    } else {
                        await interaction.editReply({
                            content: `⚠️ Bot is missing the following permissions: ${missingPermissions.join(', ')}`
                        });
                    }
                    break;

                case 'connection':
                    console.log('DEBUG: Connection test executed by', interaction.user.tag);

                    // Test if mongoose is available
                    try {
                        const mongoose = require('mongoose');

                        // Check mongoose connection state
                        if (mongoose.connection.readyState === 1) {
                            await interaction.editReply({
                                content: '✅ Database connection is active!'
                            });
                        } else {
                            // Connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
                            const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
                            await interaction.editReply({
                                content: `ℹ️ Database not connected. Current state: ${states[mongoose.connection.readyState]}`
                            });
                        }
                    } catch (error) {
                        await interaction.editReply({
                            content: `❌ Error checking database: ${error.message}`
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('DEBUG COMMAND ERROR:', error);

            // Try to respond with the error if we haven't replied yet
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: `❌ Debug command error: ${error.message}\n\nCheck server logs for details.`
                    });
                } else {
                    await interaction.reply({
                        content: `❌ Debug command error: ${error.message}\n\nCheck server logs for details.`,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error response:', replyError);
            }
        }
    }
};