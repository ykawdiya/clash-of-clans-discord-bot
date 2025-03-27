// src/utils/serverSetup.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const configManager = require('./configManager');

/**
 * Create categories and channels for server
 * @param {Guild} guild Discord guild
 * @param {String} templateName The server template to use
 * @returns {Promise<Array>} Array of created channels/categories
 */
async function createServerStructure(guild, templateName = 'standard') {
    // Get template configuration
    const template = configManager.getServerTemplate(templateName);
    if (!template) {
        throw new Error(`Template "${templateName}" not found`);
    }

    const createdChannels = [];

    // Add delay to avoid rate limits
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Check if needed categories already exist
    const existingCategories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);

    // Create each category and its channels
    for (const categoryData of template.categories) {
        // First check if a similar category exists
        let category = existingCategories.find(c => c.name.toLowerCase().includes(categoryData.name.toLowerCase()));

        // If not, create it
        if (!category) {
            try {
                category = await guild.channels.create({
                    name: categoryData.name,
                    type: ChannelType.GuildCategory,
                    reason: 'Server setup wizard'
                });

                createdChannels.push({
                    id: category.id,
                    name: category.name,
                    type: 'category'
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating category ${categoryData.name}:`, error);
                continue; // Skip this category but continue with others
            }
        }

        // Create channels in this category
        for (const channelData of categoryData.channels) {
            // Check if channel with similar name already exists in this category
            const similarChannel = guild.channels.cache.find(c =>
                c.name.toLowerCase().includes(channelData.name.toLowerCase()) &&
                c.parentId === category.id
            );

            // Skip if similar channel exists
            if (similarChannel) continue;

            try {
                // Create the channel
                const channelType = channelData.type === 'voice'
                    ? ChannelType.GuildVoice
                    : ChannelType.GuildText;

                const channel = await guild.channels.create({
                    name: channelData.name,
                    type: channelType,
                    parent: category,
                    topic: channelData.description || null,
                    reason: 'Server setup wizard'
                });

                createdChannels.push({
                    id: channel.id,
                    name: channel.name,
                    type: channelData.type,
                    categoryId: category.id
                });

                // Add small delay to avoid rate limits
                await wait(500);
            } catch (error) {
                console.error(`Error creating channel ${channelData.name}:`, error);
                continue; // Skip this channel but continue with others
            }
        }
    }

    return createdChannels;
}

/**
 * Delete unused channels and categories
 * @param {Guild} guild Discord guild
 * @returns {Promise<Array>} Array of deleted channels
 */
async function cleanupUnusedChannels(guild) {
    // Find default channels often created by Discord
    const unusedDefaults = ['general', 'welcome'];
    const unusedChannels = guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText &&
        unusedDefaults.includes(c.name) &&
        !c.messages.cache.size // Empty channels
    );

    const deletedChannels = [];

    // Delete each unused channel
    for (const [_, channel] of unusedChannels) {
        try {
            await channel.delete('Cleanup by server setup wizard');
            deletedChannels.push(channel.name);
        } catch (error) {
            console.error(`Error deleting channel ${channel.name}:`, error);
        }
    }

    return deletedChannels;
}

/**
 * Find special channels like announcement, rules, etc.
 * @param {Guild} guild Discord guild
 * @returns {Object} Map of channel types to channel IDs
 */
function findSpecialChannels(guild) {
    const specialChannels = {
        welcome: null,
        rules: null,
        announcements: null,
        general: null,
        warLog: null,
        warPlanning: null,
        botCommands: null
    };

    // Look for channels by common names
    for (const [_, channel] of guild.channels.cache.filter(c => c.type === ChannelType.GuildText)) {
        const name = channel.name.toLowerCase();

        if (name.includes('welcome') || name.includes('intro')) {
            specialChannels.welcome = channel.id;
        } else if (name.includes('rule') || name.includes('info')) {
            specialChannels.rules = channel.id;
        } else if (name.includes('announce') || name.includes('news')) {
            specialChannels.announcements = channel.id;
        } else if (name.includes('general') || name.includes('chat')) {
            specialChannels.general = channel.id;
        } else if (name.includes('war') && (name.includes('log') || name.includes('result'))) {
            specialChannels.warLog = channel.id;
        } else if (name.includes('war') && (name.includes('plan') || name.includes('strategy'))) {
            specialChannels.warPlanning = channel.id;
        } else if (name.includes('bot') || name.includes('command')) {
            specialChannels.botCommands = channel.id;
        }
    }

    return specialChannels;
}

/**
 * Create essential channels if they don't exist
 * @param {Guild} guild Discord guild
 * @returns {Promise<Object>} Map of channel types to created channel IDs
 */
async function createEssentialChannels(guild) {
    // Find existing special channels
    const specialChannels = findSpecialChannels(guild);
    const created = {};

    // Essential channels to create if missing
    const essentialChannels = [
        { type: 'rules', name: 'rules', missing: !specialChannels.rules },
        { type: 'announcements', name: 'announcements', missing: !specialChannels.announcements },
        { type: 'botCommands', name: 'bot-commands', missing: !specialChannels.botCommands }
    ];

    // Create missing essential channels
    for (const channel of essentialChannels) {
        if (channel.missing) {
            try {
                const newChannel = await guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildText,
                    reason: 'Server setup - essential channel'
                });

                created[channel.type] = newChannel.id;
                specialChannels[channel.type] = newChannel.id;
            } catch (error) {
                console.error(`Error creating ${channel.name}:`, error);
            }
        }
    }

    return {
        existing: specialChannels,
        created: created
    };
}

module.exports = {
    createServerStructure,
    cleanupUnusedChannels,
    findSpecialChannels,
    createEssentialChannels
};