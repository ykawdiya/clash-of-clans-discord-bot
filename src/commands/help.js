// src/commands/help.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with bot commands')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Command category')
        .setRequired(false)
        .addChoices(
          { name: 'War', value: 'war' },
          { name: 'CWL', value: 'cwl' },
          { name: 'Clan Capital', value: 'capital' },
          { name: 'Player', value: 'player' },
          { name: 'Clan', value: 'clan' },
          { name: 'Admin', value: 'admin' }
        )),
  
  async execute(interaction) {
    try {
      const category = interaction.options.getString('category');
      
      if (category) {
        // Show detailed help for specific category
        const helpEmbed = await this.getCategoryHelp(category);
        return interaction.reply({ embeds: [helpEmbed] });
      }
      
      // Show general help
      const helpEmbed = new EmbedBuilder()
        .setTitle('Clash of Clans Bot Help')
        .setDescription('Use the following commands to manage your Clash of Clans clan:')
        .setColor('#3498db')
        .addFields(
          { name: 'War Commands', value: '`/war status` - Show current war status\n`/war call` - Call a base in war\n`/war map` - Show war map\n`/help war` - Show all war commands', inline: true },
          { name: 'CWL Commands', value: '`/cwl status` - Show CWL status\n`/cwl roster` - Manage CWL roster\n`/cwl plan` - View war plans\n`/help cwl` - Show all CWL commands', inline: true },
          { name: 'Capital Commands', value: '`/capital status` - Show capital status\n`/capital raids` - Raid weekend info\n`/capital contribute` - Track contributions\n`/help capital` - Show all capital commands', inline: true },
          { name: 'Other Commands', value: '`/clan info` - View clan information\n`/player link` - Link your CoC account\n`/setup` - Set up server for optimal usage\n`/help [category]` - Show detailed help for a category', inline: false }
        )
        .setFooter({ text: 'Select a category for more detailed help' });
      
      return interaction.reply({ embeds: [helpEmbed] });
    } catch (error) {
      console.error('Error executing help command:', error);
      return interaction.reply({
        content: 'An error occurred while showing help. Please try again later.',
        ephemeral: true
      });
    }
  },
  
  /**
   * Get detailed help for a specific category
   * @param {String} category - Command category
   * @returns {EmbedBuilder} - Help embed
   */
  async getCategoryHelp(category) {
    const embed = new EmbedBuilder()
      .setColor('#3498db');
    
    switch (category) {
      case 'war':
        embed.setTitle('War Commands Help')
          .setDescription('Commands for managing clan wars:')
          .addFields(
            { name: '/war status', value: 'Show current war status and details', inline: true },
            { name: '/war call <base> [note]', value: 'Call a base for your attack with optional notes', inline: true },
            { name: '/war map', value: 'View the current war map with base assignments', inline: true },
            { name: '/war plan', value: 'View or create war plan for the current war', inline: true },
            { name: '/war stats', value: 'View detailed attack statistics for the current or recent wars', inline: true }
          )
          .setFooter({ text: 'War commands are most effective when used in the war-related channels' });
        break;
        
      case 'cwl':
        embed.setTitle('CWL Commands Help')
          .setDescription('Commands for managing Clan War League:')
          .addFields(
            { name: '/cwl status', value: 'Show current CWL status and progress', inline: true },
            { name: '/cwl roster view', value: 'View the current CWL roster', inline: true },
            { name: '/cwl roster add <tag>', value: 'Add a player to the CWL roster', inline: true },
            { name: '/cwl roster remove <tag>', value: 'Remove a player from the CWL roster', inline: true },
            { name: '/cwl plan [day]', value: 'View war plan for specific CWL day', inline: true },
            { name: '/cwl stats', value: 'View detailed CWL statistics', inline: true },
            { name: '/cwl medals', value: 'View CWL medal calculator by league', inline: true }
          )
          .setFooter({ text: 'Remember in CWL: Each player only gets ONE attack per war!' });
        break;
        
      case 'capital':
        embed.setTitle('Clan Capital Commands Help')
          .setDescription('Commands for managing Clan Capital:')
          .addFields(
            { name: '/capital status', value: 'Show Clan Capital status and district levels', inline: true },
            { name: '/capital raids status', value: 'Show current raid weekend status', inline: true },
            { name: '/capital raids history', value: 'View historical raid weekend results', inline: true },
            { name: '/capital contribute add <amount>', value: 'Record Capital Gold contribution', inline: true },
            { name: '/capital contribute leaderboard', value: 'View contribution leaderboard', inline: true },
            { name: '/capital planner recommended', value: 'Get recommended upgrade path', inline: true },
            { name: '/capital planner set <district>', value: 'Set a district as priority for upgrades', inline: true }
          )
          .setFooter({ text: 'Track contributions to optimize your Capital progression!' });
        break;
        
      case 'player':
        embed.setTitle('Player Commands Help')
          .setDescription('Commands for player information and linking:')
          .addFields(
            { name: '/player info [tag|user]', value: 'View player information', inline: true },
            { name: '/player link <tag>', value: 'Link your Clash of Clans account', inline: true },
            { name: '/player unlink', value: 'Unlink your Clash of Clans account', inline: true },
            { name: '/player stats [tag|user]', value: 'View detailed player statistics', inline: true }
          )
          .setFooter({ text: 'Link your account to use many bot features more easily' });
        break;
        
      case 'clan':
        embed.setTitle('Clan Commands Help')
          .setDescription('Commands for clan information and management:')
          .addFields(
            { name: '/clan info [tag]', value: 'View clan information', inline: true },
            { name: '/clan link <tag>', value: 'Link clan to this server', inline: true },
            { name: '/clan members [tag]', value: 'View clan members list', inline: true },
            { name: '/clan wars [tag]', value: 'View clan war statistics', inline: true }
          )
          .setFooter({ text: 'Linking your clan is required for most bot features' });
        break;
        
      case 'admin':
        embed.setTitle('Admin Commands Help')
          .setDescription('Commands for server setup and administration:')
          .addFields(
            { name: '/setup single', value: 'Set up server for single clan', inline: true },
            { name: '/setup multi <count>', value: 'Set up server for multiple clans', inline: true }
          )
          .setFooter({ text: 'Admin commands require Administrator permission' });
        break;
        
      default:
        embed.setTitle('Help Category Not Found')
          .setDescription('Please select a valid category: war, cwl, capital, player, clan, or admin.');
    }
    
    return embed;
  }
};
