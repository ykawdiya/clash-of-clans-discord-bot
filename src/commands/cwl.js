// src/commands/cwl.js
const { SlashCommandBuilder } = require('discord.js');
const cwlStatusCommand = require('./cwl/status');
const cwlRosterCommand = require('./cwl/roster');
const cwlPlanCommand = require('./cwl/plan');
const cwlStatsCommand = require('./cwl/stats');
const cwlMedalsCommand = require('./cwl/medals');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cwl')
    .setDescription('CWL management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show current CWL status'))
    .addSubcommandGroup(group =>
      group
        .setName('roster')
        .setDescription('Manage CWL roster')
        .addSubcommand(subcommand =>
          subcommand
            .setName('view')
            .setDescription('View the current CWL roster'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Add a player to the CWL roster')
            .addStringOption(option =>
              option.setName('tag')
                .setDescription('Player tag to add')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove a player from the CWL roster')
            .addStringOption(option =>
              option.setName('tag')
                .setDescription('Player tag to remove')
                .setRequired(true))))
    .addSubcommand(subcommand =>
      subcommand
        .setName('plan')
        .setDescription('View/create CWL war plan')
        .addIntegerOption(option =>
          option.setName('day')
            .setDescription('CWL war day (1-7)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(7)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Show CWL statistics'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('medals')
        .setDescription('View CWL medal calculator')),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const group = interaction.options.getSubcommandGroup(false);
      
      if (group === 'roster') {
        return await cwlRosterCommand.execute(interaction);
      }
      
      switch (subcommand) {
        case 'status':
          return await cwlStatusCommand.execute(interaction);
        case 'plan':
          return await cwlPlanCommand.execute(interaction);
        case 'stats':
          return await cwlStatsCommand.execute(interaction);
        case 'medals':
          return await cwlMedalsCommand.execute(interaction);
        default:
          return interaction.reply({
            content: 'Unknown subcommand. Please use a valid CWL command.',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error executing cwl command:', error);
      return interaction.reply({
        content: 'An error occurred while processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};
