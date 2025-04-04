// src/commands/player.js (Enhanced with advanced player stats)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { User } = require('../models');
const clashApiService = require('../services/clashApiService');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('player')
      .setDescription('Player information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('View player information')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag (if not viewing your own profile)')
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
              .setName('achievements')
              .setDescription('View detailed player achievements')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag (if not viewing your own profile)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('heroes')
              .setDescription('View hero levels and upgrade status')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Player tag (if not viewing your own profile)')
                      .setRequired(false))),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'info') {
        await this.handleInfo(interaction);
      }
      else if (subcommand === 'link') {
        await this.handleLink(interaction);
      }
      else if (subcommand === 'achievements') {
        await this.handleAchievements(interaction);
      }
      else if (subcommand === 'heroes') {
        await this.handleHeroes(interaction);
      }
      else {
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
      }
    } catch (error) {
      log.error('Error executing player command:', { error: error.message });

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        }).catch(e => {
          log.error(`Failed to send error response:`, { error: e.message });
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing the command.'
        }).catch(e => {
          log.error(`Failed to edit deferred reply:`, { error: e.message });
        });
      }
    }
  },

  async handleInfo(interaction) {
    await interaction.deferReply(); // Defer reply since we'll make API calls

    try {
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // If no tag provided, check if user has a linked account
      if (!playerTag) {
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (user && user.playerTag) {
          playerTag = user.playerTag;
        } else {
          return interaction.editReply({
            content: 'You have no linked Clash of Clans account. Please provide a player tag or link your account first using `/player link <tag>`'
          });
        }
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
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for player "${playerTag}" from the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Create the main player embed
      const mainEmbed = this.createPlayerMainEmbed(playerData);
      
      // Create the troops embed
      const troopsEmbed = this.createPlayerTroopsEmbed(playerData);
      
      // Create the achievements embed
      const achievementsEmbed = this.createPlayerAchievementsEmbed(playerData);
      
      // Send all the embeds
      return interaction.editReply({ 
        embeds: [mainEmbed, troopsEmbed, achievementsEmbed]
      });
    } catch (error) {
      log.error('Error handling player info:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving player information. Please try again later.' });
    }
  },

  async handleLink(interaction) {
    await interaction.deferReply(); // Defer reply since we'll make API calls
    
    try {
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
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to verify player "${playerTag}" with the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Check if player is already linked to another Discord user
      const existingUser = await User.findOne({ playerTag });
      
      if (existingUser && existingUser.discordId !== interaction.user.id) {
        return interaction.editReply({
          content: `This player is already linked to another Discord user. If this is your account, please contact a server administrator.`
        });
      }
      
      // Check if the current user already has a linked account
      let user = await User.findOne({ discordId: interaction.user.id });
      
      if (user) {
        // Update existing user
        user.playerTag = playerTag;
        user.playerName = playerData.name;
        user.townHallLevel = playerData.townHallLevel;
        user.discordUsername = interaction.user.username;
      } else {
        // Create new user
        user = new User({
          discordId: interaction.user.id,
          discordUsername: interaction.user.username,
          playerTag: playerTag,
          playerName: playerData.name,
          townHallLevel: playerData.townHallLevel
        });
      }
      
      await user.save();
      
      return interaction.editReply({
        content: `Successfully linked your Discord account to ${playerData.name} (${playerTag}). You can now use player-specific features!`
      });
    } catch (error) {
      log.error('Error handling player link:', { error: error.message });
      return interaction.editReply({ content: 'Error linking player. Please try again later.' });
    }
  },
  
  createPlayerMainEmbed(playerData) {
    // Format player name with TH level icon
    const thIcons = ['⬜', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣'];
    const thIcon = playerData.townHallLevel <= 15 ? thIcons[playerData.townHallLevel] : `TH${playerData.townHallLevel}`;
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`${playerData.name} [${playerData.tag}]`)
      .setDescription(`${thIcon} Town Hall Level ${playerData.townHallLevel}${playerData.townHallWeaponLevel ? ` (Weapon Level ${playerData.townHallWeaponLevel})` : ''}`)
      .setColor('#3498db');
    
    // Add basic player info
    embed.addFields(
      { name: 'Experience', value: `Level ${playerData.expLevel}`, inline: true },
      { name: 'Trophies', value: `${playerData.trophies} / ${playerData.bestTrophies} (best)`, inline: true },
      { name: 'War Stars', value: playerData.warStars.toString(), inline: true }
    );
    
    // Add clan info if available
    if (playerData.clan) {
      embed.addFields(
        { name: 'Clan', value: `[${playerData.clan.name} (${playerData.clan.tag})](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(playerData.clan.tag.substring(1))})`, inline: true },
        { name: 'Role', value: playerData.role.charAt(0).toUpperCase() + playerData.role.slice(1), inline: true }
      );
    } else {
      embed.addFields({ name: 'Clan', value: 'No Clan', inline: true });
    }
    
    // Add donation stats
    if (playerData.donations !== undefined || playerData.donationsReceived !== undefined) {
      let donationText = '';
      if (playerData.donations !== undefined) {
        donationText += `Given: ${playerData.donations}`;
      }
      if (playerData.donationsReceived !== undefined) {
        donationText += donationText ? ` | Received: ${playerData.donationsReceived}` : `Received: ${playerData.donationsReceived}`;
      }
      
      if (donationText) {
        embed.addFields({ name: 'Donations', value: donationText, inline: true });
      }
    }
    
    // Add builder base info
    if (playerData.builderHallLevel) {
      embed.addFields(
        { name: 'Builder Hall', value: `Level ${playerData.builderHallLevel}`, inline: true },
        { name: 'Builder Trophies', value: `${playerData.builderBaseTrophies} / ${playerData.bestBuilderBaseTrophies} (best)`, inline: true }
      );
    }
    
    // Add attack and defense stats
    embed.addFields(
      { name: 'Attack Wins', value: playerData.attackWins?.toString() || '0', inline: true },
      { name: 'Defense Wins', value: playerData.defenseWins?.toString() || '0', inline: true }
    );
    
    // Add capital contributions if available
    if (playerData.clanCapitalContributions) {
      embed.addFields(
        { name: 'Capital Contributions', value: playerData.clanCapitalContributions.toString(), inline: true }
      );
    }
    
    // Add player league if available
    if (playerData.league) {
      embed.addFields(
        { name: 'League', value: playerData.league.name, inline: true }
      );
    }
    
    // Add player avatar if available
    if (playerData.league && playerData.league.iconUrls && playerData.league.iconUrls.medium) {
      embed.setThumbnail(playerData.league.iconUrls.medium);
    }
    
    // Add footer
    embed.setFooter({ 
      text: `Data updated: ${new Date().toLocaleString()}`
    });
    
    return embed;
  },
  
  createPlayerTroopsEmbed(playerData) {
    // Create embed for troop levels
    const embed = new EmbedBuilder()
      .setTitle(`Troop Levels - ${playerData.name}`)
      .setColor('#e67e22');
    
    // Add troop info if available
    if (playerData.troops && playerData.troops.length > 0) {
      // Separate home village and builder base troops
      const homeTroops = playerData.troops.filter(troop => troop.village === 'home');
      const builderTroops = playerData.troops.filter(troop => troop.village === 'builderBase');
      
      // Format home village troops
      if (homeTroops.length > 0) {
        // Group troops into categories for better display
        const elixirTroops = homeTroops.filter(t => 
          ['Barbarian', 'Archer', 'Giant', 'Goblin', 'Wall Breaker', 'Balloon', 'Wizard', 'Healer', 'Dragon', 'P.E.K.K.A', 'Baby Dragon', 'Miner', 'Electro Dragon', 'Yeti', 'Dragon Rider', 'Electro Titan'].includes(t.name)
        );
        
        const darkTroops = homeTroops.filter(t => 
          ['Minion', 'Hog Rider', 'Valkyrie', 'Golem', 'Witch', 'Lava Hound', 'Bowler', 'Ice Golem', 'Headhunter'].includes(t.name)
        );
        
        const spells = homeTroops.filter(t => 
          ['Lightning Spell', 'Healing Spell', 'Rage Spell', 'Jump Spell', 'Freeze Spell', 'Clone Spell', 'Invisibility Spell', 'Recall Spell', 'Poison Spell', 'Earthquake Spell', 'Haste Spell', 'Skeleton Spell', 'Bat Spell'].includes(t.name)
        );
        
        const sieges = homeTroops.filter(t => 
          ['Wall Wrecker', 'Battle Blimp', 'Stone Slammer', 'Siege Barracks', 'Log Launcher', 'Flame Flinger', 'Battle Drill'].includes(t.name)
        );
        
        // Format troop levels
        const formatTroopList = (troops) => {
          return troops.map(troop => {
            const maxLevel = troop.maxLevel || 1;
            const progressEmoji = troop.level === maxLevel ? '✅' : 
                                  troop.level >= Math.floor(maxLevel * 0.75) ? '🟢' :
                                  troop.level >= Math.floor(maxLevel * 0.5) ? '🟡' : '🔴';
            
            return `${progressEmoji} ${troop.name}: ${troop.level}/${maxLevel}`;
          }).join('\n');
        };
        
        // Add elixir troops
        if (elixirTroops.length > 0) {
          embed.addFields({
            name: 'Elixir Troops',
            value: formatTroopList(elixirTroops) || 'None Unlocked',
            inline: true
          });
        }
        
        // Add dark troops
        if (darkTroops.length > 0) {
          embed.addFields({
            name: 'Dark Elixir Troops',
            value: formatTroopList(darkTroops) || 'None Unlocked',
            inline: true
          });
        }
        
        // Add spells
        if (spells.length > 0) {
          embed.addFields({
            name: 'Spells',
            value: formatTroopList(spells) || 'None Unlocked',
            inline: false
          });
        }
        
        // Add siege machines
        if (sieges.length > 0) {
          embed.addFields({
            name: 'Siege Machines',
            value: formatTroopList(sieges) || 'None Unlocked',
            inline: false
          });
        }
      } else {
        embed.addFields({
          name: 'Troops',
          value: 'No troop information available'
        });
      }
    } else {
      embed.setDescription('No troop information available');
    }
    
    // Add heroes
    if (playerData.heroes && playerData.heroes.length > 0) {
      const homeHeroes = playerData.heroes.filter(hero => hero.village === 'home');
      
      if (homeHeroes.length > 0) {
        const heroList = homeHeroes.map(hero => {
          const maxLevel = hero.maxLevel || 1;
          const progressEmoji = hero.level === maxLevel ? '✅' : 
                               hero.level >= Math.floor(maxLevel * 0.75) ? '🟢' :
                               hero.level >= Math.floor(maxLevel * 0.5) ? '🟡' : '🔴';
          
          return `${progressEmoji} ${hero.name}: ${hero.level}/${maxLevel}`;
        }).join('\n');
        
        embed.addFields({
          name: 'Heroes',
          value: heroList || 'No heroes unlocked',
          inline: false
        });
      }
    }
    
    return embed;
  },
  
  createPlayerAchievementsEmbed(playerData) {
    // Create embed for achievements
    const embed = new EmbedBuilder()
      .setTitle(`Achievements - ${playerData.name}`)
      .setColor('#9b59b6');
    
    // Add achievements if available
    if (playerData.achievements && playerData.achievements.length > 0) {
      // Sort achievements by completion percentage
      const sortedAchievements = [...playerData.achievements].sort((a, b) => {
        const aComplete = a.value / a.target;
        const bComplete = b.value / b.target;
        return bComplete - aComplete; // Descending order
      });
      
      // Pick the most interesting/relevant achievements
      const keyAchievements = sortedAchievements.filter(a => 
        ['War Hero', 'Friend in Need', 'Unbreakable', 'Sweet Victory!', 'Conqueror', 'Humiliator', 'Gold Grab', 'Elixir Escapade', 'Heroic Heist', 'Games Champion', 'Well Seasoned', 'Clan Capital Contributor'].includes(a.name)
      ).slice(0, 9); // Take top 9 for display
      
      if (keyAchievements.length > 0) {
        let achievementsList = '';
        
        for (const achievement of keyAchievements) {
          const percentComplete = Math.min(100, Math.round((achievement.value / achievement.target) * 100));
          const progressBar = this.createProgressBar(percentComplete, 10);
          const starsDisplay = '⭐'.repeat(achievement.stars);
          
          achievementsList += `**${achievement.name}** ${starsDisplay}\n`;
          achievementsList += `\`${progressBar}\` ${percentComplete}% (${achievement.value.toLocaleString()}/${achievement.target.toLocaleString()})\n`;
        }
        
        embed.setDescription(achievementsList);
      } else {
        embed.setDescription('No achievement information available');
      }
      
      // Count total achievement stars
      const totalStars = playerData.achievements.reduce((total, achievement) => total + achievement.stars, 0);
      const maxPossibleStars = playerData.achievements.length * 3;
      
      embed.setFooter({
        text: `Total Achievement Stars: ${totalStars}/${maxPossibleStars}`
      });
    } else {
      embed.setDescription('No achievement information available');
    }
    
    return embed;
  },
  
  createProgressBar(percent, length = 10) {
    const filledBars = Math.round((percent / 100) * length);
    return '█'.repeat(filledBars) + '░'.repeat(length - filledBars);
  },

  async handleAchievements(interaction) {
    await interaction.deferReply();

    try {
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // If no tag provided, check if user has a linked account
      if (!playerTag) {
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (user && user.playerTag) {
          playerTag = user.playerTag;
        } else {
          return interaction.editReply({
            content: 'You have no linked Clash of Clans account. Please provide a player tag or link your account first using `/player link <tag>`'
          });
        }
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
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for player "${playerTag}" from the Clash of Clans API.\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Create a detailed achievements embed
      const embed = new EmbedBuilder()
        .setTitle(`${playerData.name} - Achievements`)
        .setDescription(`Detailed achievement progress for ${playerData.name} [${playerData.tag}]`)
        .setColor('#9b59b6');
      
      // Add achievements if available
      if (playerData.achievements && playerData.achievements.length > 0) {
        // Count total stars
        const totalStars = playerData.achievements.reduce((total, achievement) => total + achievement.stars, 0);
        const maxPossibleStars = playerData.achievements.length * 3;
        
        embed.addFields({
          name: 'Achievement Stars',
          value: `${totalStars}/${maxPossibleStars} stars earned (${Math.round((totalStars / maxPossibleStars) * 100)}% complete)`,
          inline: false
        });
        
        // Sort achievements by category
        const combatAchievements = playerData.achievements.filter(a => 
          ['Conqueror', 'Unbreakable', 'Humiliator', 'War Hero', 'War League Legend', 'Heroic Heist'].includes(a.name)
        );
        
        const resourceAchievements = playerData.achievements.filter(a => 
          ['Gold Grab', 'Elixir Escapade', 'Clan Capital Contributor', 'Aggressive Capitalism'].includes(a.name)
        );
        
        const miscAchievements = playerData.achievements.filter(a => 
          ['Friend in Need', 'Nice and Tidy', 'Games Champion', 'Well Seasoned'].includes(a.name)
        );
        
        // Add combat achievements
        if (combatAchievements.length > 0) {
          let combatList = '';
          
          for (const achievement of combatAchievements) {
            const percentComplete = Math.min(100, Math.round((achievement.value / achievement.target) * 100));
            const progressBar = this.createProgressBar(percentComplete, 12);
            const starsDisplay = '⭐'.repeat(achievement.stars);
            
            combatList += `**${achievement.name}** ${starsDisplay}\n`;
            combatList += `${progressBar} ${percentComplete}%\n`;
            combatList += `Progress: ${achievement.value.toLocaleString()}/${achievement.target.toLocaleString()}\n\n`;
          }
          
          embed.addFields({
            name: 'Combat Achievements',
            value: combatList || 'None available',
            inline: false
          });
        }
        
        // Add resource achievements
        if (resourceAchievements.length > 0) {
          let resourceList = '';
          
          for (const achievement of resourceAchievements) {
            const percentComplete = Math.min(100, Math.round((achievement.value / achievement.target) * 100));
            const progressBar = this.createProgressBar(percentComplete, 12);
            const starsDisplay = '⭐'.repeat(achievement.stars);
            
            resourceList += `**${achievement.name}** ${starsDisplay}\n`;
            resourceList += `${progressBar} ${percentComplete}%\n`;
            resourceList += `Progress: ${achievement.value.toLocaleString()}/${achievement.target.toLocaleString()}\n\n`;
          }
          
          embed.addFields({
            name: 'Resource Achievements',
            value: resourceList || 'None available',
            inline: false
          });
        }
        
        // Add miscellaneous achievements
        if (miscAchievements.length > 0) {
          let miscList = '';
          
          for (const achievement of miscAchievements) {
            const percentComplete = Math.min(100, Math.round((achievement.value / achievement.target) * 100));
            const progressBar = this.createProgressBar(percentComplete, 12);
            const starsDisplay = '⭐'.repeat(achievement.stars);
            
            miscList += `**${achievement.name}** ${starsDisplay}\n`;
            miscList += `${progressBar} ${percentComplete}%\n`;
            miscList += `Progress: ${achievement.value.toLocaleString()}/${achievement.target.toLocaleString()}\n\n`;
          }
          
          embed.addFields({
            name: 'Miscellaneous Achievements',
            value: miscList || 'None available',
            inline: false
          });
        }
      } else {
        embed.setDescription('No achievement information available for this player.');
      }
      
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling player achievements:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving player achievements. Please try again later.' });
    }
  },

  async handleHeroes(interaction) {
    await interaction.deferReply();

    try {
      // Get player tag
      let playerTag = interaction.options.getString('tag');
      
      // If no tag provided, check if user has a linked account
      if (!playerTag) {
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (user && user.playerTag) {
          playerTag = user.playerTag;
        } else {
          return interaction.editReply({
            content: 'You have no linked Clash of Clans account. Please provide a player tag or link your account first using `/player link <tag>`'
          });
        }
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
      
      // Check if the data is a placeholder due to API unavailability
      if (playerData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for player "${playerTag}" from the Clash of Clans API.\n\nTry again later or contact the bot administrator.`
        });
      }
      
      // Create heroes embed
      const embed = new EmbedBuilder()
        .setTitle(`${playerData.name} - Heroes`)
        .setDescription(`Hero levels and upgrade progress for ${playerData.name} [${playerData.tag}]`)
        .setColor('#f1c40f');
      
      // Add heroes if available
      if (playerData.heroes && playerData.heroes.length > 0) {
        // Separate home village and builder base heroes
        const homeHeroes = playerData.heroes.filter(hero => hero.village === 'home');
        const builderHeroes = playerData.heroes.filter(hero => hero.village === 'builderBase');
        
        // Add home village heroes
        if (homeHeroes.length > 0) {
          let heroList = '';
          
          for (const hero of homeHeroes) {
            const maxLevel = hero.maxLevel || 1;
            const percentComplete = Math.round((hero.level / maxLevel) * 100);
            const progressBar = this.createProgressBar(percentComplete, 15);
            const upgradeRemaining = maxLevel - hero.level;
            
            heroList += `**${hero.name}** - Level ${hero.level}/${maxLevel}\n`;
            heroList += `${progressBar} ${percentComplete}%\n`;
            
            if (upgradeRemaining > 0) {
              heroList += `${upgradeRemaining} level${upgradeRemaining !== 1 ? 's' : ''} remaining to max\n\n`;
            } else {
              heroList += `✅ **MAXED**\n\n`;
            }
          }
          
          // Calculate overall hero progress
          const totalLevels = homeHeroes.reduce((sum, hero) => sum + hero.level, 0);
          const maxPossibleLevels = homeHeroes.reduce((sum, hero) => sum + hero.maxLevel, 0);
          const overallPercent = Math.round((totalLevels / maxPossibleLevels) * 100);
          
          embed.addFields(
            { 
              name: 'Overall Hero Progress', 
              value: `${this.createProgressBar(overallPercent, 20)} ${overallPercent}%\n${totalLevels}/${maxPossibleLevels} total levels`, 
              inline: false 
            },
            { 
              name: 'Home Village Heroes', 
              value: heroList || 'No heroes unlocked', 
              inline: false 
            }
          );
        }
        
        // Add builder base heroes
        if (builderHeroes.length > 0) {
          let builderHeroList = '';
          
          for (const hero of builderHeroes) {
            const maxLevel = hero.maxLevel || 1;
            const percentComplete = Math.round((hero.level / maxLevel) * 100);
            const progressBar = this.createProgressBar(percentComplete, 15);
            const upgradeRemaining = maxLevel - hero.level;
            
            builderHeroList += `**${hero.name}** - Level ${hero.level}/${maxLevel}\n`;
            builderHeroList += `${progressBar} ${percentComplete}%\n`;
            
            if (upgradeRemaining > 0) {
              builderHeroList += `${upgradeRemaining} level${upgradeRemaining !== 1 ? 's' : ''} remaining to max\n\n`;
            } else {
              builderHeroList += `✅ **MAXED**\n\n`;
            }
          }
          
          embed.addFields({
            name: 'Builder Base Heroes',
            value: builderHeroList || 'No builder heroes unlocked',
            inline: false
          });
        }
        
        // Add TH level context
        embed.setFooter({
          text: `Town Hall ${playerData.townHallLevel} | Builder Hall ${playerData.builderHallLevel || "N/A"}`
        });
      } else {
        embed.setDescription('No hero information available for this player.');
      }
      
      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling player heroes:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving player heroes. Please try again later.' });
    }
  }
};