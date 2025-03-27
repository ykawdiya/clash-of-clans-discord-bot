// src/commands/base/base.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('../../models/User');
const ErrorHandler = require('../../utils/errorHandler');

// Define a new model for base layouts
const baseSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    baseId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    type: {
        type: String,
        enum: ['home', 'war', 'hybrid', 'farming', 'progress', 'builder'],
        default: 'home'
    },
    townHallLevel: {
        type: Number,
        required: true,
        min: 1,
        max: 15
    },
    baseLink: {
        type: String,
        required: true
    },
    imageUrl: String,
    creator: {
        discordId: String,
        name: String,
        playerTag: String
    },
    ratings: [{
        discordId: String,
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: String
    }],
    tags: [String],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create compound indices for efficient queries
baseSchema.index({ guildId: 1, townHallLevel: 1 });
baseSchema.index({ guildId: 1, type: 1 });
baseSchema.index({ guildId: 1, 'creator.discordId': 1 });

// Virtual for average rating
baseSchema.virtual('averageRating').get(function() {
    if (this.ratings.length === 0) return 0;
    const sum = this.ratings.reduce((total, rating) => total + rating.rating, 0);
    return sum / this.ratings.length;
});

const Base = mongoose.model('Base', baseSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('base')
        .setDescription('Share and manage base layouts')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new base layout')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the base layout')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('link')
                        .setDescription('Link to the base (e.g., Clash of Clans game link or image URL)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('th_level')
                        .setDescription('Town Hall level')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(15))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of base')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Home Village', value: 'home' },
                            { name: 'War Base', value: 'war' },
                            { name: 'Hybrid Base', value: 'hybrid' },
                            { name: 'Farming Base', value: 'farming' },
                            { name: 'Progress Base', value: 'progress' },
                            { name: 'Builder Base', value: 'builder' }
                        ))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description of the base')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('image_url')
                        .setDescription('URL to an image of the base')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('tags')
                        .setDescription('Tags for the base (comma-separated)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Search for base layouts')
                .addIntegerOption(option =>
                    option.setName('th_level')
                        .setDescription('Town Hall level')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(15))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of base')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Home Village', value: 'home' },
                            { name: 'War Base', value: 'war' },
                            { name: 'Hybrid Base', value: 'hybrid' },
                            { name: 'Farming Base', value: 'farming' },
                            { name: 'Progress Base', value: 'progress' },
                            { name: 'Builder Base', value: 'builder' }
                        ))
                .addStringOption(option =>
                    option.setName('tags')
                        .setDescription('Tags to search for (comma-separated)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a specific base layout')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID of the base layout')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rate')
                .setDescription('Rate a base layout')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID of the base layout')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('rating')
                        .setDescription('Rating (1-5 stars)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(5))
                .addStringOption(option =>
                    option.setName('comment')
                        .setDescription('Comment on your rating')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a base layout you created')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID of the base layout')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your shared base layouts')),

    category: 'Base Sharing',

    manualDeferring: true,

    longDescription: 'Share, search for, and rate base layouts. Add your own layouts, search for layouts by Town Hall level or type, and rate others\' layouts to help clan members find the best bases.',

    examples: [
        '/base add name:War Base TH13 link:https://link.clashofclans.com/en?action=OpenLayout... th_level:13 type:war',
        '/base search th_level:12 type:war',
        '/base view id:ABC123',
        '/base rate id:ABC123 rating:4 comment:Great base!',
        '/base list'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add':
                    await addBase(interaction);
                    break;
                case 'search':
                    await searchBases(interaction);
                    break;
                case 'view':
                    await viewBase(interaction);
                    break;
                case 'rate':
                    await rateBase(interaction);
                    break;
                case 'delete':
                    await deleteBase(interaction);
                    break;
                case 'list':
                    await listBases(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in base command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'base command'));
        }
    },
};

/**
 * Add a new base layout
 */
async function addBase(interaction) {
    const name = interaction.options.getString('name');
    const link = interaction.options.getString('link');
    const thLevel = interaction.options.getInteger('th_level');
    const type = interaction.options.getString('type');
    const description = interaction.options.getString('description') || '';
    const imageUrl = interaction.options.getString('image_url');
    const tagsString = interaction.options.getString('tags');

    // Generate a unique base ID
    const baseId = generateUniqueId();

    // Parse tags if provided
    const tags = tagsString ? tagsString.split(',').map(tag => tag.trim().toLowerCase()) : [];

    // Get user's Clash of Clans account if linked
    let playerTag = null;
    const linkedUser = await User.findOne({ discordId: interaction.user.id });
    if (linkedUser && linkedUser.playerTag) {
        playerTag = linkedUser.playerTag;
    }

    // Create base record
    const base = new Base({
        guildId: interaction.guild.id,
        baseId: baseId,
        name: name,
        description: description,
        type: type,
        townHallLevel: thLevel,
        baseLink: link,
        imageUrl: imageUrl || null,
        creator: {
            discordId: interaction.user.id,
            name: interaction.user.username,
            playerTag: playerTag
        },
        ratings: [],
        tags: tags
    });

    await base.save();

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Base Layout Added')
        .setDescription(`Your base layout has been added with ID: \`${baseId}\``)
        .addFields(
            { name: 'Name', value: name, inline: true },
            { name: 'Type', value: formatBaseType(type), inline: true },
            { name: 'Town Hall', value: `TH${thLevel}`, inline: true }
        )
        .setFooter({ text: 'Use /base view id:' + baseId + ' to view details' });

    // Add image if provided
    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Search for base layouts
 */
async function searchBases(interaction) {
    const thLevel = interaction.options.getInteger('th_level');
    const type = interaction.options.getString('type');
    const tagsString = interaction.options.getString('tags');

    // Build search query
    const query = { guildId: interaction.guild.id };

    if (thLevel) {
        query.townHallLevel = thLevel;
    }

    if (type) {
        query.type = type;
    }

    // Add tags to query if provided
    if (tagsString) {
        const tags = tagsString.split(',').map(tag => tag.trim().toLowerCase());
        if (tags.length > 0) {
            query.tags = { $in: tags };
        }
    }

    // Find bases matching criteria
    const bases = await Base.find(query).sort({ createdAt: -1 }).limit(25);

    if (bases.length === 0) {
        return interaction.editReply('No base layouts found matching your criteria.');
    }

    // Create search results embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Base Layout Search Results')
        .setDescription(`Found ${bases.length} matching base layouts`);

    // Group bases by town hall level
    const basesByTH = {};
    bases.forEach(base => {
        if (!basesByTH[base.townHallLevel]) {
            basesByTH[base.townHallLevel] = [];
        }
        basesByTH[base.townHallLevel].push(base);
    });

    // Add fields for each TH level
    Object.keys(basesByTH).sort((a, b) => b - a).forEach(thLevel => {
        const thBases = basesByTH[thLevel];
        let basesList = '';

        thBases.forEach(base => {
            const rating = base.ratings.length > 0
                ? ` • Rating: ${'⭐'.repeat(Math.round(base.averageRating))} (${base.ratings.length})`
                : ' • No ratings';

            basesList += `**${base.name}** (${formatBaseType(base.type)}) • ID: \`${base.baseId}\`${rating}\n`;
        });

        embed.addFields({ name: `Town Hall ${thLevel}`, value: basesList });
    });

    // Add view instructions
    embed.setFooter({ text: 'Use /base view id:BASE_ID to view details of a specific base' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * View a specific base layout
 */
async function viewBase(interaction) {
    const baseId = interaction.options.getString('id');

    // Find the base
    const base = await Base.findOne({ baseId: baseId, guildId: interaction.guild.id });

    if (!base) {
        return interaction.editReply(`Base layout with ID \`${baseId}\` not found.`);
    }

    // Calculate average rating
    const avgRating = base.ratings.length > 0
        ? base.ratings.reduce((sum, r) => sum + r.rating, 0) / base.ratings.length
        : 0;

    // Format ratings display
    const ratingsCount = base.ratings.length;
    const ratingStars = avgRating > 0 ? '⭐'.repeat(Math.round(avgRating)) : 'No ratings';
    const ratingsDisplay = ratingsCount > 0
        ? `${ratingStars} (${avgRating.toFixed(1)}/5 from ${ratingsCount} ratings)`
        : 'No ratings yet';

    // Create base view embed
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`${base.name} (TH${base.townHallLevel})`)
        .setDescription(base.description || 'No description provided')
        .addFields(
            { name: 'Type', value: formatBaseType(base.type), inline: true },
            { name: 'Town Hall', value: `TH${base.townHallLevel}`, inline: true },
            { name: 'Creator', value: `<@${base.creator.discordId}>`, inline: true },
            { name: 'Rating', value: ratingsDisplay, inline: true },
            { name: 'Created', value: new Date(base.createdAt).toLocaleDateString(), inline: true },
            { name: 'Base ID', value: base.baseId, inline: true },
            { name: 'Base Link', value: base.baseLink }
        )
        .setFooter({ text: 'Use /base rate to rate this base' });

    // Add tags if present
    if (base.tags && base.tags.length > 0) {
        embed.addFields({ name: 'Tags', value: base.tags.map(tag => `#${tag}`).join(' ') });
    }

    // Add image if available
    if (base.imageUrl) {
        embed.setImage(base.imageUrl);
    }

    // Add recent ratings if available
    if (base.ratings.length > 0) {
        const recentRatings = base.ratings.slice(-3); // Get up to 3 most recent ratings
        const ratingsText = await Promise.all(recentRatings.map(async rating => {
            try {
                const member = await interaction.guild.members.fetch(rating.discordId);
                return `**${member.displayName}**: ${'⭐'.repeat(rating.rating)} ${rating.comment || ''}`;
            } catch (error) {
                return `**Unknown User**: ${'⭐'.repeat(rating.rating)} ${rating.comment || ''}`;
            }
        }));

        embed.addFields({ name: 'Recent Ratings', value: ratingsText.join('\n') || 'No ratings yet' });
    }

    // Create action row with buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rate_${base.baseId}`)
                .setLabel('Rate This Base')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`copy_${base.baseId}`)
                .setLabel('Copy Base Link')
                .setStyle(ButtonStyle.Secondary)
        );

    return interaction.editReply({ embeds: [embed], components: [actionRow] });
}

/**
 * Rate a base layout
 */
async function rateBase(interaction) {
    const baseId = interaction.options.getString('id');
    const rating = interaction.options.getInteger('rating');
    const comment = interaction.options.getString('comment') || '';

    // Find the base
    const base = await Base.findOne({ baseId: baseId, guildId: interaction.guild.id });

    if (!base) {
        return interaction.editReply(`Base layout with ID \`${baseId}\` not found.`);
    }

    // Check if user already rated this base
    const existingRatingIndex = base.ratings.findIndex(r => r.discordId === interaction.user.id);

    if (existingRatingIndex !== -1) {
        // Update existing rating
        base.ratings[existingRatingIndex] = {
            discordId: interaction.user.id,
            rating: rating,
            comment: comment
        };
    } else {
        // Add new rating
        base.ratings.push({
            discordId: interaction.user.id,
            rating: rating,
            comment: comment
        });
    }

    // Update base
    base.updatedAt = new Date();
    await base.save();

    // Calculate new average rating
    const avgRating = base.ratings.reduce((sum, r) => sum + r.rating, 0) / base.ratings.length;

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Base Rated Successfully')
        .setDescription(`You rated **${base.name}** with ${rating} star${rating !== 1 ? 's' : ''}`)
        .addFields(
            { name: 'Your Rating', value: '⭐'.repeat(rating), inline: true },
            { name: 'Your Comment', value: comment || 'No comment provided', inline: true },
            { name: 'New Average Rating', value: `${'⭐'.repeat(Math.round(avgRating))} (${avgRating.toFixed(1)}/5 from ${base.ratings.length} ratings)` }
        )
        .setFooter({ text: `Base ID: ${base.baseId}` });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Delete a base layout
 */
async function deleteBase(interaction) {
    const baseId = interaction.options.getString('id');

    // Find the base
    const base = await Base.findOne({ baseId: baseId, guildId: interaction.guild.id });

    if (!base) {
        return interaction.editReply(`Base layout with ID \`${baseId}\` not found.`);
    }

    // Check if user is the creator
    if (base.creator.discordId !== interaction.user.id) {
        return interaction.editReply(`You can only delete base layouts that you created.`);
    }

    // Delete the base
    await Base.deleteOne({ baseId: baseId });

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Base Layout Deleted')
        .setDescription(`Your base layout **${base.name}** (ID: \`${base.baseId}\`) has been deleted.`);

    return interaction.editReply({ embeds: [embed] });
}

/**
 * List user's shared base layouts
 */
async function listBases(interaction) {
    // Find all bases created by the user
    const bases = await Base.find({
        guildId: interaction.guild.id,
        'creator.discordId': interaction.user.id
    }).sort({ createdAt: -1 });

    if (bases.length === 0) {
        return interaction.editReply('You have not shared any base layouts yet. Use `/base add` to share a base.');
    }

    // Create list embed
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Your Shared Base Layouts')
        .setDescription(`You have shared ${bases.length} base layouts`);

    // Group bases by type
    const basesByType = {};
    bases.forEach(base => {
        if (!basesByType[base.type]) {
            basesByType[base.type] = [];
        }
        basesByType[base.type].push(base);
    });

    // Add fields for each type
    Object.keys(basesByType).forEach(type => {
        const typeBases = basesByType[type];
        let basesList = '';

        typeBases.forEach(base => {
            const rating = base.ratings.length > 0
                ? ` • Rating: ${'⭐'.repeat(Math.round(base.averageRating))} (${base.ratings.length})`
                : ' • No ratings';

            basesList += `**${base.name}** (TH${base.townHallLevel}) • ID: \`${base.baseId}\`${rating}\n`;
        });

        embed.addFields({ name: formatBaseType(type), value: basesList });
    });

    // Add view instructions
    embed.setFooter({ text: 'Use /base view id:BASE_ID to view details of a specific base' });

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Generate a unique base ID
 */
function generateUniqueId() {
    // Generate a random base ID (6 characters)
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';

    for (let i = 0; i < 6; i++) {
        id += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return id;
}

/**
 * Format base type for display
 */
function formatBaseType(type) {
    const typeMap = {
        'home': 'Home Village',
        'war': 'War Base',
        'hybrid': 'Hybrid Base',
        'farming': 'Farming Base',
        'progress': 'Progress Base',
        'builder': 'Builder Base'
    };

    return typeMap[type] || type;
}