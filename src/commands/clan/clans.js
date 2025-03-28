// src/commands/clan/clans.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const Clan = require('../../models/Clan');
const { validateTag } = require('../../utils/validators');
const ErrorHandler = require('../../utils/errorHandler');
const { commands: log } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clans')
        .setDescription('Manage multiple clans for this server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a clan to this server')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Clan tag (e.g. #ABC123)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Clan type/purpose')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Main Clan', value: 'Main' },
                            { name: 'Feeder Clan', value: 'Feeder' },
                            { name: 'War Clan', value: 'War' },
                            { name: 'Casual Clan', value: 'Casual' },
                            { name: 'CWL Clan', value: 'CWL' },
                            { name: 'Other', value: 'Other' }
                        ))
                .addBooleanOption(option =>
                    option.setName('primary')
                        .setDescription('Set as primary clan for this server')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('family_id')
                        .setDescription('Family/Alliance identifier')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all clans registered to this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_primary')
                .setDescription('Set the primary clan for this server')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Clan tag (e.g. #ABC123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a clan from this server')
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Clan tag (e.g. #ABC123)')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add':
                    await addClan(interaction);
                    break;
                case 'list':
                    await listClans(interaction);
                    break;
                case 'set_primary':
                    await setPrimaryClan(interaction);
                    break;
                case 'remove':
                    await removeClan(interaction);
                    break;
                default:
                    return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            log.error('Error in clans command', { error: error.message, stack: error.stack });
            return interaction.editReply(ErrorHandler.formatError(error, 'clan management'));
        }
    },
};

async function addClan(interaction) {
    // Validate and format clan tag
    const rawTag = interaction.options.getString('tag');
    const validation = validateTag(rawTag);
    if (!validation.valid) {
        return interaction.editReply(validation.message);
    }
    const clanTag = validation.formattedTag;

    // Get other parameters
    const clanType = interaction.options.getString('type');
    const isPrimary = interaction.options.getBoolean('primary') || false;
    const familyId = interaction.options.getString('family_id') || null;

    // Check if this clan is already registered to this server
    const existingClan = await Clan.findOne({
        clanTag: clanTag,
        guildId: interaction.guild.id
    });

    if (existingClan) {
        return interaction.editReply(`This clan is already registered to this server as a ${existingClan.clanType} clan.`);
    }

    // Fetch clan data from API
    try {
        const clanData = await clashApiService.getClan(clanTag);

        // Create new clan document
        const clan = new Clan({
            clanTag: clanData.tag,
            name: clanData.name,
            guildId: interaction.guild.id,
            isPrimary: isPrimary,
            clanType: clanType,
            familyId: familyId,
            description: clanData.description || '',
            // Add default settings
            settings: {
                channels: {
                    general: interaction.channel.id
                }
            }
        });

        await clan.save();

        // Log the action
        log.info('Clan added', {
            guildId: interaction.guild.id,
            clanTag: clanData.tag,
            clanName: clanData.name,
            clanType: clanType,
            isPrimary: isPrimary,
            by: interaction.user.id
        });

        // Create success embed
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('Clan Added Successfully')
            .setDescription(`Added ${clanData.name} (${clanData.tag}) to this server`)
            .setThumbnail(clanData.badgeUrls?.medium || null)
            .addFields(
                { name: 'Clan Type', value: clanType, inline: true },
                { name: 'Primary Clan', value: isPrimary ? 'Yes' : 'No', inline: true },
                { name: 'Members', value: `${clanData.members}/50`, inline: true }
            );

        if (familyId) {
            embed.addFields({ name: 'Family/Alliance ID', value: familyId, inline: true });
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        log.error('Error adding clan', {
            error: error.message,
            clanTag,
            guildId: interaction.guild.id
        });

        if (error.message.includes('404')) {
            return interaction.editReply(`Clan not found. Please check the tag and try again.`);
        }
        throw error;
    }
}

async function listClans(interaction) {
    // Get all clans for this server
    const clans = await Clan.find({ guildId: interaction.guild.id })
        .sort({ isPrimary: -1, clanType: 1, name: 1 });

    if (clans.length === 0) {
        return interaction.editReply('No clans are registered to this server. Use `/clans add` to add a clan.');
    }

    // Create embeds for clan list
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`Registered Clans for ${interaction.guild.name}`)
        .setDescription(`Total clans: ${clans.length}`);

    // Group clans by type
    const clansByType = {};
    clans.forEach(clan => {
        if (!clansByType[clan.clanType]) {
            clansByType[clan.clanType] = [];
        }
        clansByType[clan.clanType].push(clan);
    });

    // Add fields for each clan type
    for (const [type, typeClans] of Object.entries(clansByType)) {
        let fieldValue = '';

        typeClans.forEach(clan => {
            fieldValue += `${clan.isPrimary ? '🌟 ' : ''}**${clan.name}** (${clan.clanTag})`;

            if (clan.familyId) {
                fieldValue += ` - Family: ${clan.familyId}`;
            }

            fieldValue += '\n';
        });

        embed.addFields({ name: `${type} Clans`, value: fieldValue });
    }

    return interaction.editReply({ embeds: [embed] });
}

async function setPrimaryClan(interaction) {
    // Validate and format clan tag
    const rawTag = interaction.options.getString('tag');
    const validation = validateTag(rawTag);
    if (!validation.valid) {
        return interaction.editReply(validation.message);
    }
    const clanTag = validation.formattedTag;

    // Find the clan
    const clan = await Clan.findOne({
        clanTag: clanTag,
        guildId: interaction.guild.id
    });

    if (!clan) {
        return interaction.editReply(`Clan with tag ${clanTag} is not registered to this server. Use \`/clans add\` to add it first.`);
    }

    // Set this clan as primary
    clan.isPrimary = true;
    await clan.save();

    log.info('Primary clan set', {
        guildId: interaction.guild.id,
        clanTag: clanTag,
        clanName: clan.name,
        by: interaction.user.id
    });

    return interaction.editReply(`✅ **${clan.name}** (${clan.clanTag}) is now set as the primary clan for this server.`);
}

async function removeClan(interaction) {
    // Validate and format clan tag
    const rawTag = interaction.options.getString('tag');
    const validation = validateTag(rawTag);
    if (!validation.valid) {
        return interaction.editReply(validation.message);
    }
    const clanTag = validation.formattedTag;

    // Find the clan
    const clan = await Clan.findOne({
        clanTag: clanTag,
        guildId: interaction.guild.id
    });

    if (!clan) {
        return interaction.editReply(`Clan with tag ${clanTag} is not registered to this server.`);
    }

    // Store clan info for confirmation message
    const clanName = clan.name;
    const wasDefault = clan.isPrimary;

    // Delete the clan
    await clan.deleteOne();

    log.info('Clan removed', {
        guildId: interaction.guild.id,
        clanTag: clanTag,
        clanName: clanName,
        wasPrimary: wasDefault,
        by: interaction.user.id
    });

    // If it was the primary, set a new primary
    if (wasDefault) {
        const remainingClans = await Clan.find({ guildId: interaction.guild.id });
        if (remainingClans.length > 0) {
            const newPrimary = remainingClans[0];
            newPrimary.isPrimary = true;
            await newPrimary.save();

            return interaction.editReply(`✅ **${clanName}** (${clanTag}) has been removed. **${newPrimary.name}** is now the primary clan for this server.`);
        }
    }

    return interaction.editReply(`✅ **${clanName}** (${clanTag}) has been removed from this server.`);
}