const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('war')
        .setDescription('Get current war information for a clan')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Clan tag (e.g. #ABC123)')
                .setRequired(false)),

    /**
     * Command category for organization
     */
    category: 'Info',

    /**
     * Full help description for the help command
     */
    longDescription: 'Shows detailed information about a clan\'s current war, including opponent, war status, attack stats, and remaining attacks. If no tag is provided, it uses the clan linked to this Discord server.',

    /**
     * Usage examples
     */
    examples: [
        '/war',
        '/war tag:#ABC123'
    ],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Check if tag option is provided
            let clanTag = interaction.options.getString('tag');

            // If no tag provided, check if server has a linked clan
            if (!clanTag) {
                const linkedClan = await Clan.findOne({ guildId: interaction.guild.id });

                if (!linkedClan) {
                    return interaction.editReply("Please provide a clan tag or link a clan to this server using `/setclan` command.");
                }

                clanTag = linkedClan.clanTag;
            } else {
                // Validate the provided tag
                const validation = validateTag(clanTag);
                if (!validation.valid) {
                    return interaction.editReply(validation.message);
                }
                clanTag = validation.formattedTag;
            }

            // Get current war data
            const warData = await clashApiService.getCurrentWar(clanTag);

            // Get clan data for clan names and badges
            const clanData = await clashApiService.getClan(clanTag);

            // Process war data
            return await processWarData(interaction, warData, clanData);

        } catch (error) {
            console.error('Error in war command:', error);

            // Return a user-friendly error response
            return interaction.editReply(ErrorHandler.formatError(error, 'war data'));
        }
    },
};

/**
 * Process and display war data
 * @param {CommandInteraction} interaction
 * @param {Object} warData
 * @param {Object} clanData
 */
async function processWarData(interaction, warData, clanData) {
    // Check war state
    if (warData.state === 'notInWar') {
        const embed = new EmbedBuilder()
            .setTitle(`${clanData.name} is not currently in a war`)
            .setColor('#3498db')
            .setThumbnail(clanData.badgeUrls.medium)
            .setDescription('The clan is not participating in a clan war right now.')
            .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // If in war, process the data
    const clan = warData.clan;
    const opponent = warData.opponent;

    // Determine war status and color
    let status, color;
    switch (warData.state) {
        case 'preparation':
            status = 'Preparation Day';
            color = '#f1c40f'; // Yellow
            break;
        case 'inWar':
            status = 'Battle Day';
            color = '#e67e22'; // Orange
            break;
        case 'warEnded':
            status = 'War Ended';
            color = '#2ecc71'; // Green
            break;
        default:
            status = warData.state;
            color = '#3498db'; // Blue
    }

    // Calculate time remaining if applicable
    let timeRemaining = '';
    if (warData.state === 'preparation') {
        const endTime = new Date(warData.startTime);
        timeRemaining = formatTimeRemaining(endTime);
    } else if (warData.state === 'inWar') {
        const endTime = new Date(warData.endTime);
        timeRemaining = formatTimeRemaining(endTime);
    }

    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle(`${clan.name} vs ${opponent.name}`)
        .setColor(color)
        .setDescription(`**Status:** ${status}${timeRemaining ? `\n**Time Remaining:** ${timeRemaining}` : ''}`)
        .addFields(
            { name: clan.name, value: `Level: ${clan.clanLevel}\nAttacks: ${clan.attacks || 0}/${clan.members * 2}\nStars: ${clan.stars || 0}\nDestruction: ${clan.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
            { name: opponent.name, value: `Level: ${opponent.clanLevel}\nAttacks: ${opponent.attacks || 0}/${opponent.members * 2}\nStars: ${opponent.stars || 0}\nDestruction: ${opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
        )
        .setFooter({ text: 'Clash of Clans Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add thumbnail if available
    if (clanData.badgeUrls && clanData.badgeUrls.medium) {
        embed.setThumbnail(clanData.badgeUrls.medium);
    }

    // Add team size
    embed.addFields({ name: 'War Size', value: `${clan.members}v${opponent.members}`, inline: false });

    // Add attacks remaining if in war
    if (warData.state === 'inWar') {
        const clanAttacksRemaining = (clan.members * 2) - (clan.attacks || 0);
        const opponentAttacksRemaining = (opponent.members * 2) - (opponent.attacks || 0);

        embed.addFields({
            name: 'Attacks Remaining',
            value: `${clan.name}: ${clanAttacksRemaining}\n${opponent.name}: ${opponentAttacksRemaining}`,
            inline: false
        });
    }

    // Add war result if ended
    if (warData.state === 'warEnded') {
        let result;
        if (clan.stars > opponent.stars) {
            result = `${clan.name} Won! 🏆`;
        } else if (clan.stars < opponent.stars) {
            result = `${opponent.name} Won! 😓`;
        } else {
            // If stars are equal, compare destruction percentage
            if (clan.destructionPercentage > opponent.destructionPercentage) {
                result = `${clan.name} Won! 🏆 (by destruction percentage)`;
            } else if (clan.destructionPercentage < opponent.destructionPercentage) {
                result = `${opponent.name} Won! 😓 (by destruction percentage)`;
            } else {
                result = "It's a Perfect Tie! 🤝";
            }
        }

        embed.addFields({ name: 'War Result', value: result, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Format time remaining until a date
 * @param {Date} endTime
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(endTime) {
    const now = new Date();
    const diff = endTime - now;

    // Handle cases where the end time has already passed
    if (diff <= 0) {
        return 'Ended';
    }

    // Calculate hours and minutes
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
}