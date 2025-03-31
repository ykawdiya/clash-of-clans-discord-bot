// src/commands/capital.js
const { SlashCommandBuilder } = require('discord.js');
const capitalStatusCommand = require('./capital/status');
const capitalRaidsCommand = require('./capital/raids');
const capitalContributeCommand = require('./capital/contribute');
const capitalPlannerCommand = require('./capital/planner');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('capital')
      .setDescription('Clan Capital commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('status')
              .setDescription('View Clan Capital status and progress'))
      .addSubcommandGroup(group =>
          group
              .setName('raids')
              .setDescription('Raid Weekend commands')
              .addSubcommand(subcommand =>
                  subcommand
                      .setName('status')
                      .setDescription('Check the current Raid Weekend status'))
              .addSubcommand(subcommand =>
                  subcommand
                      .setName('history')
                      .setDescription('View historical Raid Weekend results')))
      .addSubcommandGroup(group =>
          group
              .setName('contribute')
              .setDescription('Capital Gold contribution commands')
              .addSubcommand(subcommand =>
                  subcommand
                      .setName('add')
                      .setDescription('Record a Capital Gold contribution')
                      .addIntegerOption(option =>
                          option.setName('amount')
                              .setDescription('Amount of Capital Gold contributed')
                              .setRequired(true)
                              .setMinValue(1)
                              .setMaxValue(100000))
                      .addStringOption(option =>
                          option.setName('player')
                              .setDescription('Player tag (default: your linked account)')
                              .setRequired(false)))
              .addSubcommand(subcommand =>
                  subcommand
                      .setName('leaderboard')
                      .setDescription('View Capital Gold contribution leaderboard')))
      .addSubcommandGroup(group =>
          group
              .setName('planner')
              .setDescription('Capital upgrade planning commands')
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
                                  { name: "Builder's Workshop", value: "Builder's Workshop" },
                                  { name: 'Dragon Cliffs', value: 'Dragon Cliffs' },
                                  { name: 'Golem Quarry', value: 'Golem Quarry' },
                                  { name: 'Skeleton Park', value: 'Skeleton Park' }
                              )))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const group = interaction.options.getSubcommandGroup();

      if (!group && subcommand === 'status') {
        // Handle capital status command
        return capitalStatusCommand.execute(interaction);
      } else if (group === 'raids') {
        // Handle capital raids commands
        return capitalRaidsCommand.execute(interaction);
      } else if (group === 'contribute') {
        // Handle capital contribute commands
        return capitalContributeCommand.execute(interaction);
      } else if (group === 'planner') {
        // Handle capital planner commands
        return capitalPlannerCommand.execute(interaction);
      }

      return interaction.reply({
        content: 'Invalid command. Use /help to see available commands.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error executing capital command:', error);
      return interaction.reply({
        content: 'An error occurred while processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};