// Example of correct command structure
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  // IMPORTANT: Every command needs this data property with SlashCommandBuilder
  data: new SlashCommandBuilder()
      .setName('commandname')
      .setDescription('Command description'),

  async execute(interaction) {
    await interaction.reply('Command response');
  }
};