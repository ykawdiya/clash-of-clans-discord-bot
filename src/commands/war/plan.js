// src/commands/war/plan.js
const { EmbedBuilder, SlashCommandBuilder} = require('discord.js');
const warTrackingService = require('../../services/warTrackingService');
const { Clan, User } = require('../../models');
const WarTracking = require('../../models/WarTracking');
const { userPermission } = require('../../utils/permissions');
const { command: log } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
      .setName('plan')
      .setDescription('View or create war plan'),

  async execute(interaction) {
    try {
      // Check permissions
      const hasPermission = await userPermission(interaction, ['Elder', 'Co-Leader', 'Leader']);
      
      // Get clan for this guild
      const clan = await Clan.findOne({ guildId: interaction.guild.id });
      
      if (!clan) {
        return interaction.reply({
          content: 'No clan is linked to this server. Ask an admin to set up the clan first.',
          ephemeral: true
        });
      }
      
      // Defer reply as this might take time
      await interaction.deferReply();
      
      // Get war status
      const warStatus = await warTrackingService.getWarStatus(clan.clanTag);
      
      if (!warStatus.inWar) {
        return interaction.editReply({
          content: 'The clan is not currently in a war.'
        });
      }
      
      // Get active war from database
      const warTracking = await WarTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!warTracking) {
        return interaction.editReply({
          content: 'No active war tracking found in database.'
        });
      }
      
      // Create war plan embed
      const embed = new EmbedBuilder()
        .setTitle(`War Plan: ${clan.name} vs ${warStatus.data.opponent.name}`)
        .setDescription(`${warStatus.data.teamSize}v${warStatus.data.teamSize} War • ${warTrackingService.formatWarState(warStatus.data.state)}`)
        .setColor(warTrackingService.getWarStateColor(warStatus.data.state));
      
      // Get member attacks and base calls
      const memberAttacks = new Map();
      const baseCalls = new Map();
      
      // Get base calls from service
      const serviceCalls = warTrackingService.baseCalls.get(clan.clanTag) || new Map();
      
      // Process base calls from database
      for (const call of warTracking.baseCalls || []) {
        baseCalls.set(call.baseNumber, {
          calledBy: call.calledBy,
          calledByName: call.calledByName,
          note: call.note,
          attacked: call.attacked,
          attackResult: call.attackResult
        });
      }
      
      // Process member attacks from database
      for (const member of warTracking.members || []) {
        if (member.attacks && member.attacks.length > 0) {
          memberAttacks.set(member.playerTag, member.attacks);
        }
      }
      
      // Generate attack plan
      let attackPlan = '';
      
      // Sort opponent members by position
      const sortedOpponents = [...warStatus.data.opponent.members].sort((a, b) => a.mapPosition - b.mapPosition);
      
      for (let i = 0; i < sortedOpponents.length; i++) {
        const opponent = sortedOpponents[i];
        const baseNumber = opponent.mapPosition;
        
        // Check if base is called
        const baseCall = baseCalls.get(baseNumber) || serviceCalls.get(baseNumber);
        
        if (baseCall) {
          const attackInfo = baseCall.attacked ? 
            `[${baseCall.attackResult.stars}⭐ ${baseCall.attackResult.percentage}%]` : 
            '[Not attacked yet]';
          
          const noteInfo = baseCall.note ? ` - Note: *${baseCall.note}*` : '';
          
          attackPlan += `• Base #${baseNumber} (TH${opponent.townhallLevel}): ${baseCall.calledByName} ${attackInfo}${noteInfo}\n`;
        } else {
          attackPlan += `• Base #${baseNumber} (TH${opponent.townhallLevel}): *No assignment yet*\n`;
        }
      }
      
      // Add attack plan to embed
      embed.addFields({
        name: 'Attack Assignments',
        value: attackPlan || 'No attack plan has been set up yet.'
      });
      
      // Add war status
      embed.addFields(
        { name: 'War Status', value: `${warStatus.data.clan.stars || 0}⭐ vs ${warStatus.data.opponent.stars || 0}⭐`, inline: true },
        { name: 'Destruction', value: `${warStatus.data.clan.destructionPercentage?.toFixed(2) || 0}% vs ${warStatus.data.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
      );
      
      // Add attack usage
      const attacksUsed = warTracking.attacksUsed || 0;
      const totalAttacks = warStatus.data.teamSize * 2;
      
      embed.addFields({
        name: 'Attack Usage',
        value: `${attacksUsed}/${totalAttacks} (${Math.round(attacksUsed/totalAttacks*100)}%)`,
        inline: true
      });
      
      // Add instructions
      embed.addFields({
        name: 'Instructions',
        value: 'Assign bases using `/war call`\nView the war map with `/war map`\nLeadership can update the war plan at any time.'
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      log.error('Error executing war plan command:', { error: error.message });
      
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while getting the war plan. Please try again later.'
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while getting the war plan. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};
