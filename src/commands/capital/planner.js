// src/commands/capital/planner.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const capitalTrackingService = require('../../services/capitalTrackingService');
const { Clan, User } = require('../../models');
const { CapitalTracking } = require('../../models');
const { userPermission } = require('../../utils/permissions');
const { command: log } = require('../../utils/logger');

module.exports = {
  // Use SlashCommandBuilder for subcommands that are directly registered
  data: new SlashCommandBuilder()
      .setName('planner')
      .setDescription('Plan Clan Capital upgrades')
      .addSubcommand(subcommand =>
          subcommand
              .setName('recommended')
              .setDescription('Get recommended upgrade path'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('set')
              .setDescription('Set a district as priority for upgrades')
              .addStringOption(option =>
                  option.setName('district')
                      .setDescription('District to prioritize')
                      .setRequired(true)
                      .addChoices(
                          { name: 'Capital Hall', value: 'Capital Hall' },
                          { name: 'Barbarian Camp', value: 'Barbarian Camp' },
                          { name: 'Wizard Valley', value: 'Wizard Valley' },
                          { name: 'Balloon Lagoon', value: 'Balloon Lagoon' },
                          { name: "Builder's Workshop', value: 'Builder's Workshop" },
                          { name: 'Dragon Cliffs', value: 'Dragon Cliffs' },
                          { name: 'Golem Quarry', value: 'Golem Quarry' },
                          { name: 'Skeleton Park', value: 'Skeleton Park' }
                      ))),

  async execute(interaction) {
    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Leader', 'Co-Leader']);

      if (!hasPermission && interaction.options.getSubcommand() === 'set') {
        return interaction.reply({
          content: 'You need to be a Co-Leader or Leader to set upgrade priorities.',
          ephemeral: true
        });
      }

      // Get the clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });

      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'recommended') {
        // Defer reply since this might take some time
        await interaction.deferReply();

        // Get capital tracking from database
        const capitalTracking = await CapitalTracking.findOne({ clanTag: clan.clanTag });

        if (!capitalTracking) {
          return interaction.editReply({
            content: 'No Clan Capital data found for this clan.'
          });
        }

        // Get next upgrade recommendation
        const nextUpgrade = await capitalTrackingService.getNextRecommendedUpgrade(capitalTracking);

        if (!nextUpgrade) {
          return interaction.editReply({
            content: 'Could not generate upgrade recommendations at this time.'
          });
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Clan Capital Upgrade Recommendation')
            .setDescription(`Based on your current Capital progress, here's the recommended upgrade path:`)
            .setColor('#3498db')
            .addFields(
                { name: 'Recommended Upgrade', value: `${nextUpgrade.name} to Level ${nextUpgrade.nextLevel}`, inline: true },
                { name: 'Upgrade Cost', value: `${nextUpgrade.cost.toLocaleString()} Capital Gold`, inline: true }
            )
            .setFooter({ text: 'Use /capital planner set to change priority' })
            .setTimestamp();

        // Get district levels
        let districtInfo = '';
        const sortedDistricts = [...capitalTracking.districts].sort((a, b) => {
          if (a.name === 'Capital Hall') return -1;
          if (b.name === 'Capital Hall') return 1;
          return a.name.localeCompare(b.name);
        });

        for (const district of sortedDistricts) {
          districtInfo += `${district.name}: Level ${district.level}\n`;
        }

        embed.addFields({ name: 'Current District Levels', value: districtInfo });

        // Add upgrade strategy if capital hall is recommended
        if (nextUpgrade.name === 'Capital Hall') {
          embed.addFields({
            name: 'Upgrade Strategy',
            value: 'Prioritizing Capital Hall is recommended as it unlocks new districts and higher level upgrades.'
          });
        } else {
          embed.addFields({
            name: 'Upgrade Strategy',
            value: 'Keeping districts balanced is optimal for overall Capital progression.'
          });
        }

        return interaction.editReply({
          embeds: [embed]
        });
      } else if (subcommand === 'set') {
        // Get district to prioritize
        const district = interaction.options.getString('district');

        // Update capital tracking
        await CapitalTracking.findOneAndUpdate(
            { clanTag: clan.clanTag },
            { priorityDistrict: district }
        );

        return interaction.reply({
          content: `Set ${district} as the priority district for upgrades.`
        });
      }
    } catch (error) {
      log.error('Error executing capital planner command:', { error: error.message });

      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while processing your request. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while processing your request. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};