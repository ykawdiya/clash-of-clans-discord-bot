// src/commands/utility/preferences.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('preferences')
        .setDescription('Manage your notification preferences')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your current notification preferences'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Update a notification preference')
                .addStringOption(option =>
                    option.setName('preference')
                        .setDescription('The preference to update')
                        .setRequired(true)
                        .addChoices(
                            { name: 'War Notifications', value: 'warNotifications' },
                            { name: 'Clan Games Reminders', value: 'clanGamesReminders' },
                            { name: 'Raid Weekend Reminders', value: 'raidWeekendReminders' },
                            { name: 'Inactivity Reminders', value: 'inactivityReminders' },
                            { name: 'Attack Reminders', value: 'attackReminders' },
                            { name: 'Progress Tracking', value: 'progressTracking' }
                        ))
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable this preference')
                        .setRequired(true))),

    category: 'Utility',

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Find or create user
            let user = await User.findOne({ discordId: interaction.user.id });

            if (!user) {
                user = new User({
                    discordId: interaction.user.id,
                    preferences: {
                        warNotifications: true,
                        clanGamesReminders: true,
                        raidWeekendReminders: true,
                        inactivityReminders: true,
                        attackReminders: true,
                        progressTracking: true
                    }
                });
                await user.save();
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'view') {
                // Create an embed with current preferences
                const embed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('Your Notification Preferences')
                    .setDescription('These settings control which notifications you receive')
                    .addFields(
                        {
                            name: 'War Notifications',
                            value: user.preferences?.warNotifications ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Clan Games Reminders',
                            value: user.preferences?.clanGamesReminders ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Raid Weekend Reminders',
                            value: user.preferences?.raidWeekendReminders ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Inactivity Reminders',
                            value: user.preferences?.inactivityReminders ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Attack Reminders',
                            value: user.preferences?.attackReminders ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Progress Tracking',
                            value: user.preferences?.progressTracking ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Use /preferences set to update these settings' });

                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }
            else if (subcommand === 'set') {
                const preference = interaction.options.getString('preference');
                const enabled = interaction.options.getBoolean('enabled');

                // Ensure preferences object exists
                if (!user.preferences) {
                    user.preferences = {};
                }

                // Update the preference
                user.preferences[preference] = enabled;
                await user.save();

                // Confirm the change
                return interaction.editReply({
                    content: `Your preference for ${formatPreferenceName(preference)} has been ${enabled ? 'enabled' : 'disabled'}.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in preferences command:', error);
            return interaction.editReply({
                content: 'An error occurred while managing your preferences.',
                ephemeral: true
            });
        }
    },
};

function formatPreferenceName(key) {
    const nameMap = {
        warNotifications: 'War Notifications',
        clanGamesReminders: 'Clan Games Reminders',
        raidWeekendReminders: 'Raid Weekend Reminders',
        inactivityReminders: 'Inactivity Reminders',
        attackReminders: 'Attack Reminders',
        progressTracking: 'Progress Tracking'
    };

    return nameMap[key] || key;
}