// src/commands/clan.js (Enhanced but safe)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Clan, User } = require('../models');
const clashApiService = require('../services/clashApiService');
const { userPermission } = require('../utils/permissions');
const { command: log } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('clan')
      .setDescription('Clan information and management commands')
      .addSubcommand(subcommand =>
          subcommand
              .setName('info')
              .setDescription('Get basic clan information')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag (default: linked clan)')
                      .setRequired(false))
              .addStringOption(option =>
                  option.setName('name')
                      .setDescription('Clan name to search (alternative to tag)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('link')
              .setDescription('Link a clan to this server')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag')
                      .setRequired(true)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('members')
              .setDescription('List clan members with details')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag (default: linked clan)')
                      .setRequired(false)))
      .addSubcommand(subcommand =>
          subcommand
              .setName('warlog')
              .setDescription('View war history for the clan')
              .addStringOption(option =>
                  option.setName('tag')
                      .setDescription('Clan tag (default: linked clan)')
                      .setRequired(false))),

  async execute(interaction) {
    // Don't defer reply right away - do it only in the specific handlers where needed
    try {
      const subcommand = interaction.options.getSubcommand();

      // Route to appropriate handler
      if (subcommand === 'info') {
        await this.handleInfo(interaction);
      }
      else if (subcommand === 'link') {
        await this.handleLink(interaction);
      }
      else if (subcommand === 'members') {
        await this.handleMembers(interaction);
      }
      else if (subcommand === 'warlog') {
        await this.handleWarlog(interaction);
      }
      else {
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true
        });
      }
    } catch (error) {
      log.error('Error executing clan command:', { error: error.message });

      // Only reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        }).catch(e => {
          log.error('Failed to send error response:', { error: e.message });
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing the command.'
        }).catch(e => {
          log.error('Failed to edit deferred reply:', { error: e.message });
        });
      }
    }
  },

  async handleInfo(interaction) {
    await interaction.deferReply(); // We'll defer here because we'll make API calls

    try {
      // Get clan tag or name
      let clanTag = interaction.options.getString('tag');
      const clanName = interaction.options.getString('name');

      // Handle search by name if provided
      if (!clanTag && clanName) {
        // Search clans by name
        log.info(`Searching clans by name: ${clanName}`);
        await interaction.editReply({
          content: `Searching for clans with name "${clanName}"...`
        });
        
        // Use search API to find clans by name
        const clans = await clashApiService.searchClans(clanName, { limit: 5 });
        
        if (!clans || clans.length === 0) {
          return interaction.editReply({
            content: `No clans found with name "${clanName}". Please try a different name or use the clan tag instead.`
          });
        }
        
        // If only one clan is found, use it directly
        if (clans.length === 1) {
          clanTag = clans[0].tag;
          log.info(`Found one clan match: ${clans[0].name} (${clanTag})`);
        } else {
          // Multiple clans found, display a list
          const embed = new EmbedBuilder()
            .setTitle(`Clans Matching "${clanName}"`)
            .setDescription('Use `/clan info tag:#TAG` with one of these tags to get detailed information:')
            .setColor('#3498db');
          
          let clanList = '';
          clans.forEach((clan, index) => {
            clanList += `${index + 1}. **${clan.name}** (${clan.tag})\n`;
            clanList += `   Level ${clan.clanLevel} • ${clan.members}/50 members\n`;
            if (clan.location && clan.location.name) {
              clanList += `   📍 ${clan.location.name}\n`;
            }
            clanList += '\n';
          });
          
          embed.addFields({ name: 'Matching Clans', value: clanList });
          
          return interaction.editReply({ 
            content: null,
            embeds: [embed] 
          });
        }
      }
      
      // If no tag or name, use linked clan
      if (!clanTag && !clanName) {
        // Use linked clan if no tag or name provided
        const clan = await Clan.findOne({ guildId: interaction.guild.id });

        if (!clan) {
          return interaction.editReply({
            content: 'No clan linked to this server. Please provide a clan tag or link a clan first.'
          });
        }

        clanTag = clan.clanTag;
      }

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();

      // Get clan data from API
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for clan "${clanTag}" from the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }

      // Create embed
      const embed = new EmbedBuilder()
          .setTitle(`${clanData.name} [${clanData.tag}]`)
          .setDescription(clanData.description || 'No description')
          .setColor('#3498db');

      // Add basic clan info
      embed.addFields(
          { name: 'Level', value: clanData.clanLevel.toString(), inline: true },
          { name: 'Members', value: `${clanData.members}/50`, inline: true },
          { name: 'War League', value: clanData.warLeague?.name || 'Not placed', inline: true }
      );

      if (clanData.warWins) {
        embed.addFields(
            { name: 'War Record', value: `Wins: ${clanData.warWins || 0}`, inline: true }
        );
      }
      
      // Add location if available
      if (clanData.location && clanData.location.name) {
        embed.addFields(
          { name: 'Location', value: clanData.location.name, inline: true }
        );
      }
      
      // Add clan badges if available
      if (clanData.badgeUrls && clanData.badgeUrls.medium) {
        embed.setThumbnail(clanData.badgeUrls.medium);
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error handling clan info:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving clan information. Please try again later.' });
    }
  },

  async handleLink(interaction) {
    await interaction.deferReply(); // We'll defer here because we'll make API calls

    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Leader', 'Co-Leader', 'Bot Admin']);

      if (!hasPermission) {
        return interaction.editReply({
          content: 'You need to be a Leader, Co-Leader, or Bot Admin to link a clan.'
        });
      }

      // Get clan tag
      let clanTag = interaction.options.getString('tag');

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();
      
      // Before making API call, check if Webshare proxy is working
      if (clashApiService.proxyAgent) {
        log.info(`Using Webshare proxy for clan link operation (${clanTag})`);
      } else {
        log.warn(`No proxy agent available for clan link operation (${clanTag})`);
      }
      
      // Get clan data from API (using Webshare proxy automatically)
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to verify clan "${clanTag}" with the Clash of Clans API.\n\nThis could be due to:\n- API service being temporarily down\n- IP address restrictions\n- Network connectivity issues\n\nTry again later or contact the bot administrator.`
        });
      }

      // Check if server already has a linked clan
      const currentClan = await Clan.findOne({ guildId: interaction.guild.id });

      if (currentClan) {
        // Update existing clan
        currentClan.clanTag = clanTag;
        currentClan.name = clanData.name;
        currentClan.level = clanData.clanLevel;

        await currentClan.save();

        return interaction.editReply({
          content: `Updated linked clan to ${clanData.name} (${clanTag}).`
        });
      }

      // Create new clan
      const newClan = new Clan({
        clanTag,
        guildId: interaction.guild.id,
        name: clanData.name,
        level: clanData.clanLevel,
        warStats: {
          wins: clanData.warWins || 0,
          losses: clanData.warLosses || 0,
          ties: clanData.warTies || 0,
          winStreak: clanData.warWinStreak || 0,
          currentWinStreak: clanData.warWinStreak || 0
        }
      });

      await newClan.save();

      return interaction.editReply({
        content: `Successfully linked ${clanData.name} (${clanTag}) to this server!`
      });
    } catch (error) {
      log.error('Error handling clan link:', { error: error.message });
      return interaction.editReply({ content: 'Error linking clan. Please try again later.' });
    }
  },

  async handleMembers(interaction) {
    await interaction.deferReply();

    try {
      // Get clan tag
      let clanTag = interaction.options.getString('tag');

      // If no tag provided, use linked clan
      if (!clanTag) {
        const clan = await Clan.findOne({ guildId: interaction.guild.id });

        if (!clan) {
          return interaction.editReply({
            content: 'No clan linked to this server. Please provide a clan tag or link a clan first.'
          });
        }

        clanTag = clan.clanTag;
      }

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();

      // Get clan data from API
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for clan "${clanTag}" from the Clash of Clans API.`
        });
      }

      // Create main embed
      const mainEmbed = new EmbedBuilder()
        .setTitle(`${clanData.name} - Members (${clanData.members}/50)`)
        .setDescription(`Clan level: ${clanData.clanLevel} | War league: ${clanData.warLeague?.name || 'Not placed'}`)
        .setColor('#3498db');
        
      if (clanData.badgeUrls && clanData.badgeUrls.medium) {
        mainEmbed.setThumbnail(clanData.badgeUrls.medium);
      }

      // Process members if available
      if (clanData.memberList && clanData.memberList.length > 0) {
        // Sort members by role hierarchy and then by trophies
        const sortedMembers = [...clanData.memberList].sort((a, b) => {
          const roleOrder = { leader: 0, coLeader: 1, admin: 2, member: 3 };
          const aRoleValue = roleOrder[a.role] ?? 4;
          const bRoleValue = roleOrder[b.role] ?? 4;
          
          if (aRoleValue !== bRoleValue) {
            return aRoleValue - bRoleValue;
          }
          
          return b.trophies - a.trophies;
        });
        
        // Create leadership section
        const leaders = sortedMembers.filter(m => m.role === 'leader' || m.role === 'coLeader');
        if (leaders.length > 0) {
          let leadershipText = '';
          leaders.forEach(member => {
            const roleEmoji = member.role === 'leader' ? '👑' : '⭐';
            leadershipText += `${roleEmoji} **${member.name}** (${member.tag})\n`;
            leadershipText += `   TH${member.townHallLevel} | ${member.trophies} trophies | ${member.role}\n`;
            
            if (member.donations || member.donationsReceived) {
              leadershipText += `   Donations: ${member.donations || 0} given, ${member.donationsReceived || 0} received\n`;
            }
            
            leadershipText += '\n';
          });
          
          mainEmbed.addFields({
            name: 'Leadership',
            value: leadershipText || 'None',
            inline: false
          });
        }
        
        // Split remaining members into groups for multiple embeds if needed
        const regularMembers = sortedMembers.filter(m => m.role === 'admin' || m.role === 'member');
        
        const embeds = [mainEmbed];
        
        // Add donation summary
        const totalDonations = sortedMembers.reduce((sum, member) => sum + (member.donations || 0), 0);
        const topDonator = sortedMembers.reduce((highest, member) => 
          (member.donations || 0) > (highest.donations || 0) ? member : highest, 
          { donations: 0 }
        );
        
        mainEmbed.addFields(
          { 
            name: 'Total Donations', 
            value: totalDonations.toLocaleString(), 
            inline: true 
          },
          { 
            name: 'Top Donator', 
            value: topDonator.donations ? `${topDonator.name} (${topDonator.donations})` : 'None', 
            inline: true 
          },
          {
            name: 'Average TH Level',
            value: (sortedMembers.reduce((sum, member) => sum + member.townHallLevel, 0) / sortedMembers.length).toFixed(1),
            inline: true
          }
        );
        
        // Process regular members
        if (regularMembers.length > 0) {
          // Chunk members into groups of 10 for display purposes
          const memberChunks = [];
          for (let i = 0; i < regularMembers.length; i += 10) {
            memberChunks.push(regularMembers.slice(i, i + 10));
          }
          
          memberChunks.forEach((chunk, index) => {
            let membersText = '';
            
            chunk.forEach(member => {
              const roleEmoji = member.role === 'admin' ? '🔷' : '👤';
              membersText += `${roleEmoji} **${member.name}** (${member.tag})\n`;
              membersText += `   TH${member.townHallLevel} | ${member.trophies} trophies | ${member.role === 'admin' ? 'Elder' : 'Member'}\n`;
              
              if (member.donations || member.donationsReceived) {
                membersText += `   Donations: ${member.donations || 0} given, ${member.donationsReceived || 0} received\n`;
              }
              
              membersText += '\n';
            });
            
            // First chunk goes into main embed, others into new embeds
            if (index === 0) {
              mainEmbed.addFields({
                name: 'Members',
                value: membersText,
                inline: false
              });
            } else {
              const memberEmbed = new EmbedBuilder()
                .setTitle(`${clanData.name} - Members (continued)`)
                .setColor('#3498db')
                .addFields({
                  name: `Members (continued)`,
                  value: membersText,
                  inline: false
                });
              
              embeds.push(memberEmbed);
            }
          });
        }
        
        // Send all embeds
        return interaction.editReply({ embeds });
      } else {
        mainEmbed.setDescription('No members found for this clan.');
        return interaction.editReply({ embeds: [mainEmbed] });
      }
    } catch (error) {
      log.error('Error handling clan members:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving clan members. Please try again later.' });
    }
  },
  
  async handleWarlog(interaction) {
    await interaction.deferReply();

    try {
      // Get clan tag
      let clanTag = interaction.options.getString('tag');

      // If no tag provided, use linked clan
      if (!clanTag) {
        const clan = await Clan.findOne({ guildId: interaction.guild.id });

        if (!clan) {
          return interaction.editReply({
            content: 'No clan linked to this server. Please provide a clan tag or link a clan first.'
          });
        }

        clanTag = clan.clanTag;
      }

      // Format clan tag
      if (!clanTag.startsWith('#')) {
        clanTag = '#' + clanTag;
      }
      clanTag = clanTag.toUpperCase();

      // Get clan data for basic info
      const clanData = await clashApiService.getClan(clanTag);

      if (!clanData) {
        return interaction.editReply({
          content: 'Clan not found. Please check the tag and try again.'
        });
      }
      
      // Check if the data is a placeholder due to API unavailability
      if (clanData.isPlaceholder) {
        return interaction.editReply({
          content: `⚠️ **API Connection Issue**: Unable to retrieve data for clan "${clanTag}" from the Clash of Clans API.`
        });
      }

      // Get war log data
      try {
        // First check if we can access the war log (it might be private)
        await interaction.editReply({
          content: `Fetching war log for ${clanData.name}...`
        });

        const warLogData = await clashApiService.getAxiosInstance().get(`/clans/${encodeURIComponent(clanTag)}/warlog`);
        
        if (warLogData.data && warLogData.data.items) {
          const wars = warLogData.data.items;
          
          // Create embed
          const embed = new EmbedBuilder()
            .setTitle(`${clanData.name} - War History`)
            .setDescription(`Recent war results for ${clanData.name} [${clanData.tag}]`)
            .setColor('#3498db');
            
          if (clanData.badgeUrls && clanData.badgeUrls.medium) {
            embed.setThumbnail(clanData.badgeUrls.medium);
          }
          
          // Add summary stats
          const totalWars = wars.length;
          const wins = wars.filter(war => war.result === 'win').length;
          const losses = wars.filter(war => war.result === 'lose').length;
          const ties = wars.filter(war => war.result === 'tie').length;
          
          embed.addFields(
            { name: 'Recent Wars', value: totalWars.toString(), inline: true },
            { name: 'Wins', value: wins.toString(), inline: true },
            { name: 'Win Rate', value: totalWars > 0 ? `${Math.round((wins / totalWars) * 100)}%` : 'N/A', inline: true }
          );
          
          // List recent wars
          if (totalWars > 0) {
            let warLog = '';
            
            // Limit to most recent 10 wars
            const recentWars = wars.slice(0, 10);
            
            recentWars.forEach((war, index) => {
              const resultEmoji = 
                war.result === 'win' ? '🏆' : 
                war.result === 'lose' ? '❌' : '🤝';
              
              const warDate = new Date(war.endTime);
              const dateString = warDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              
              warLog += `${index + 1}. ${resultEmoji} vs **${war.opponent.name}** - ${dateString}\n`;
              warLog += `   Stars: ${war.clan.stars}⭐ - ${war.opponent.stars}⭐ | `;
              warLog += `Destruction: ${war.clan.destructionPercentage.toFixed(2)}% - ${war.opponent.destructionPercentage.toFixed(2)}%\n`;
              warLog += `   Team Size: ${war.teamSize} vs ${war.teamSize}\n\n`;
            });
            
            embed.addFields({ 
              name: 'Recent War Results', 
              value: warLog || 'No recent wars found' 
            });
          }
          
          // Overall clan war stats from clan data
          if (clanData.warWins || clanData.warLosses || clanData.warTies) {
            let overallStats = '';
            
            if (clanData.warWins) overallStats += `Wins: ${clanData.warWins}\n`;
            if (clanData.warLosses) overallStats += `Losses: ${clanData.warLosses}\n`;
            if (clanData.warTies) overallStats += `Ties: ${clanData.warTies}\n`;
            
            if (clanData.warWinStreak) {
              overallStats += `Current Win Streak: ${clanData.warWinStreak}\n`;
            }
            
            if (overallStats) {
              embed.addFields({ 
                name: 'Overall War Stats', 
                value: overallStats 
              });
            }
          }
          
          return interaction.editReply({ 
            content: null,
            embeds: [embed] 
          });
        } else {
          return interaction.editReply({
            content: 'No war log data available for this clan.'
          });
        }
      } catch (error) {
        if (error.response && error.response.status === 403) {
          // War log is private
          const embed = new EmbedBuilder()
            .setTitle(`${clanData.name} - War History`)
            .setDescription(`⚠️ ${clanData.name}'s war log is set to private.`)
            .setColor('#e74c3c')
            .addFields({
              name: 'How to Fix',
              value: 'To view war history, clan leadership must set the war log to public in the in-game clan settings.'
            });
            
          if (clanData.badgeUrls && clanData.badgeUrls.medium) {
            embed.setThumbnail(clanData.badgeUrls.medium);
          }
          
          // Add overall stats if available even if log is private
          if (clanData.warWins) {
            embed.addFields({
              name: 'Limited Stats Available',
              value: `Total War Wins: ${clanData.warWins}\nWar League: ${clanData.warLeague?.name || 'Not placed'}`
            });
          }
          
          return interaction.editReply({ 
            content: null,
            embeds: [embed] 
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      log.error('Error handling clan war log:', { error: error.message });
      return interaction.editReply({ content: 'Error retrieving clan war log. Please try again later.' });
    }
  }
};