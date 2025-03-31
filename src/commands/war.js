// src/commands/war.js
const { SlashCommandBuilder } = require('discord.js');
const warStatusCommand = require('./war/status');
const warCallCommand = require('./war/call');
const warPlanCommand = require('./war/plan');
const warMapCommand = require('./war/map');
const warStatsCommand = require('./war/stats');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('war')
      .setDescription('War management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('status')
              .setDescription('Show current war status'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('call')
              .setDescription('Call a base in war')
              .addIntegerOption(option =>
                  option.setName('base')
                      .setDescription('Base number to call')
                      .setRequired(true))
              .addStringOption(option =>
                  option.setName('note')
                      .setDescription('Optional note about your attack plan')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('plan')
              .setDescription('View or create war plan'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('map')
              .setDescription('Show the war map with calls'))
      .addSubcommand(subcommand =>
          subcommand
              .setName('stats')
              .setDescription('Show attack statistics')),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'status':
          return await warStatusCommand.execute(interaction);
        case 'call':
          return await warCallCommand.execute(interaction);
        case 'plan':
          return await warPlanCommand.execute(interaction);
        case 'map':
          return await warMapCommand.execute(interaction);
        case 'stats':
          return await warStatsCommand.execute(interaction);
        default:
          return interaction.reply({
            content: 'Unknown subcommand. Please use a valid war command.',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error executing war command:', error);
      return interaction.reply({
        content: 'An error occurred while processing your request. Please try again later.',
        ephemeral: true
      });
    }
  }
};