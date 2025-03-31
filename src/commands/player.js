// src/commands/player.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Clan, User } = require('../models');
const clashApiService = require('../services/clashApiService');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Player information and management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Get player information')
        .addStringOption(option =>
          option.setName('tag')
            .setDescription('Player tag (default: your linked account)')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user (default: yourself)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Link your Clash of Clans account')
        .addStringOption(option =>
          option.setName('tag')
            .setDescription('Player tag')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlink')
        .setDescription('Unlink your Clash of Clans account'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View player stats')
        .addStringOption(option =>
          option.setName('tag')
            .setDescription('Player tag (default: your linked account)')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user (default: yourself)')
            .setRequired(false))),
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'info':
          await this.handleInfo(interaction);
          break;
        case 'link':
          await this.handleLink(interaction);
          break;
        case 'unlink':
          await this.handleUnlink(interaction);
          break;
        case 'stats':
          await this.handleStats(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      log.error('Error executing player command:', { error: error.message });
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: 'An error occurred while processing the command. Please try again later.'
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing the command. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle player info subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleInfo(interaction) {
    try {
      await interaction.deferReply();
      
      // Get player tag from options or linked account
      let playerTag = interaction.options.getString('tag');
      const discordUser = interaction.options.getUser('user') || interaction.user;
      
      if (!playerTag) {
        // Try to get linked account
        const user = await User.findOne({ discordId: discordUser.id });
        
        if (!user || !user.playerTag) {
          if (discordUser.id === interaction.user.id) {
            return interaction.editReply({
              content: 'You don\'t have a linked account. Please provide a player tag or link your account first.'
            });
          } else {
            return interaction.editReply({
              content: `${discordUser.username} doesn't have a linked account. Please provide a player tag.`
            });
          }
        }
        
        playerTag = user.playerTag;
      }
      
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Get player data from API
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        return interaction.editReply({
          content: 'Player not found. Please check the tag and try again.'
        });
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${playerData.name} [${playerData.tag}]`)
        .setDescription(`Town Hall Level: ${playerData.townHallLevel}`)
        .setColor('#3498db')
        .setThumbnail(`https://cdn.clashofclans.com/levels/town-halls/th${playerData.townHallLevel}${playerData.townHallWeaponLevel ? '-" + playerData.townHallWeaponLevel' : ''}.png`)
        .addFields(
          { name: 'Exp Level', value: playerData.expLevel.toString(), inline: true },
          { name: 'League', value: playerData.league?.name || 'Unranked', inline: true },
          { name: 'Trophies', value: playerData.trophies.toString(), inline: true },
          { name: 'Versus Trophies', value: playerData.versusTrophies.toString(), inline: true },
          { name: 'Best Trophies', value: playerData.bestTrophies.toString(), inline: true },
          { name: 'War Stars', value: playerData.warStars.toString(), inline: true }
        );
        
      // Add clan information if available
      if (playerData.clan) {
        embed.addFields({
          name: 'Clan',
          value: `[${playerData.clan.name}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(playerData.clan.tag)}) (${playerData.role || 'Member'})`,
          inline: false
        });
      }
      
      // Add hero levels if available
      const heroes = [];
      
      if (playerData.heroes && playerData.heroes.length > 0) {
        for (const hero of playerData.heroes) {
          if (hero.village === 'home') {
            heroes.push(`${hero.name}: Level ${hero.level}`);
          }
        }
        
        if (heroes.length > 0) {
          embed.addFields({
            name: 'Heroes',
            value: heroes.join('\n'),
            inline: false
          });
        }
      }
      
      // Add Discord user info if linked
      if (discordUser.id !== interaction.user.id) {
        embed.setFooter({ text: `Information for ${discordUser.username}` });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling player info:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle player link subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleLink(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Get player data from API
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        return interaction.editReply({
          content: 'Player not found. Please check the tag and try again.'
        });
      }
      
      // Check if player is already linked
      const existingUser = await User.findOne({ playerTag });
      
      if (existingUser && existingUser.discordId !== interaction.user.id) {
        return interaction.editReply({
          content: 'This player is already linked to another Discord user.'
        });
      }
      
      // Check if user already has a linked account
      const currentUser = await User.findOne({ discordId: interaction.user.id });
      
      if (currentUser) {
        // Update existing user
        currentUser.playerTag = playerTag;
        currentUser.playerName = playerData.name;
        currentUser.townHallLevel = playerData.townHallLevel;
        
        await currentUser.save();
        
        return interaction.editReply({
          content: `Updated your linked account to ${playerData.name} (${playerTag}).`
        });
      }
      
      // Create new user
      const newUser = new User({
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
        playerTag,
        playerName: playerData.name,
        townHallLevel: playerData.townHallLevel
      });
      
      await newUser.save();
      
      return interaction.editReply({
        content: `Successfully linked your account to ${playerData.name} (${playerTag})!`
      });
    } catch (error) {
      log.error('Error handling player link:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle player unlink subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleUnlink(interaction) {
    try {
      // Check if user has a linked account
      const user = await User.findOne({ discordId: interaction.user.id });
      
      if (!user) {
        return interaction.reply({
          content: 'You don\'t have a linked account.',
          ephemeral: true
        });
      }
      
      // Remove linked account
      await User.deleteOne({ discordId: interaction.user.id });
      
      return interaction.reply({
        content: `Successfully unlinked your account (${user.playerName}).`,
        ephemeral: true
      });
    } catch (error) {
      log.error('Error handling player unlink:', { error: error.message });
      throw error;
    }
  },
  
  /**
   * Handle player stats subcommand
   * @param {Interaction} interaction - Discord interaction
   */
  async handleStats(interaction) {
    try {
      await interaction.deferReply();
      
      // Get player tag from options or linked account
      let playerTag = interaction.options.getString('tag');
      const discordUser = interaction.options.getUser('user') || interaction.user;
      
      if (!playerTag) {
        // Try to get linked account
        const user = await User.findOne({ discordId: discordUser.id });
        
        if (!user || !user.playerTag) {
          if (discordUser.id === interaction.user.id) {
            return interaction.editReply({
              content: 'You don\'t have a linked account. Please provide a player tag or link your account first.'
            });
          } else {
            return interaction.editReply({
              content: `${discordUser.username} doesn't have a linked account. Please provide a player tag.`
            });
          }
        }
        
        playerTag = user.playerTag;
      }
      
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Get player data from API
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        return interaction.editReply({
          content: 'Player not found. Please check the tag and try again.'
        });
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${playerData.name} - Statistics`)
        .setColor('#3498db')
        .setThumbnail(`https://cdn.clashofclans.com/levels/town-halls/th${playerData.townHallLevel}${playerData.townHallWeaponLevel ? '-" + playerData.townHallWeaponLevel' : ''}.png`);
        
      // Add basic stats
      embed.addFields(
        { name: 'Trophies', value: `${playerData.trophies} (Peak: ${playerData.bestTrophies})`, inline: true },
        { name: 'Versus Trophies', value: `${playerData.versusTrophies} (Peak: ${playerData.bestVersusTrophies || 0})`, inline: true },
        { name: 'War Stars', value: playerData.warStars.toString(), inline: true },
        { name: 'Attack Wins', value: playerData.attackWins.toString(), inline: true },
        { name: 'Defense Wins', value: playerData.defenseWins.toString(), inline: true },
        { name: 'Donations', value: `Given: ${playerData.donations}\nReceived: ${playerData.donationsReceived}`, inline: true }
      );
      
      // Add hero levels
      const homeHeroes = [];
      const builderHeroes = [];
      
      if (playerData.heroes && playerData.heroes.length > 0) {
        for (const hero of playerData.heroes) {
          if (hero.village === 'home') {
            homeHeroes.push(`${hero.name}: ${hero.level}/${hero.maxLevel}`);
          } else {
            builderHeroes.push(`${hero.name}: ${hero.level}/${hero.maxLevel}`);
          }
        }
        
        if (homeHeroes.length > 0) {
          embed.addFields({
            name: 'Heroes (Home Village)',
            value: homeHeroes.join('\n'),
            inline: true
          });
        }
        
        if (builderHeroes.length > 0) {
          embed.addFields({
            name: 'Heroes (Builder Base)',
            value: builderHeroes.join('\n'),
            inline: true
          });
        }
      }
      
      // Add troop levels summary
      const homeTroopCount = playerData.troops?.filter(t => t.village === 'home' && !t.isSpell && !t.isSiege).length || 0;
      const homeSpellCount = playerData.troops?.filter(t => t.village === 'home' && t.isSpell).length || 0;
      const homeSiegeCount = playerData.troops?.filter(t => t.village === 'home' && t.isSiege).length || 0;
      
      const homeTroopMaxCount = playerData.troops?.filter(t => t.village === 'home' && !t.isSpell && !t.isSiege && t.level === t.maxLevel).length || 0;
      const homeSpellMaxCount = playerData.troops?.filter(t => t.village === 'home' && t.isSpell && t.level === t.maxLevel).length || 0;
      const homeSiegeMaxCount = playerData.troops?.filter(t => t.village === 'home' && t.isSiege && t.level === t.maxLevel).length || 0;
      
      if (homeTroopCount > 0) {
        embed.addFields({
          name: 'Troop Progress',
          value: [
            `Troops: ${homeTroopMaxCount}/${homeTroopCount} maxed (${Math.floor(homeTroopMaxCount/homeTroopCount*100)}%)`,
            `Spells: ${homeSpellMaxCount}/${homeSpellCount} maxed (${Math.floor(homeSpellMaxCount/homeSpellCount*100)}%)`,
            `Siege Machines: ${homeSiegeMaxCount}/${homeSiegeCount} maxed (${Math.floor(homeSiegeMaxCount/homeSiegeCount*100)}%)`
          ].join('\n'),
          inline: false
        });
      }
      
      // Calculate achievement points
      const achievementPoints = playerData.achievements?.reduce((sum, a) => sum + a.stars, 0) || 0;
      
      embed.addFields({
        name: 'Achievement Points',
        value: achievementPoints.toString(),
        inline: true
      });
      
      // Add clan capital contributions if available
      if (playerData.clanCapitalContributions) {
        embed.addFields({
          name: 'Clan Capital Contributions',
          value: playerData.clanCapitalContributions.toLocaleString(),
          inline: true
        });
      }
      
      // Add Discord user info if linked
      if (discordUser.id !== interaction.user.id) {
        embed.setFooter({ text: `Statistics for ${discordUser.username}` });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling player stats:', { error: error.message });
      throw error;
    }
  }
};
