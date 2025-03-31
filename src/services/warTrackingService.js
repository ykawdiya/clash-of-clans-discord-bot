// src/services/warTrackingService.js
const { EmbedBuilder } = require('discord.js');
const WarTracking = require('../models/WarTracking');
const Clan = require('../models/Clan');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

class WarTrackingService {
  constructor() {
    // Initialize tracking maps for active wars
    this.activeWars = new Map();
    this.baseCalls = new Map();
    this.checkInterval = 30 * 60 * 1000; // 30 minutes
    this.monitorInterval = null;
    this.warEndNotifiers = new Set();
  }

  /**
   * Start monitoring wars for all registered clans
   */
  async startWarMonitoring() {
    log.info('Starting war monitoring service');
    
    // Clear any existing interval
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Load any active wars from database first
    await this.loadActiveWarsFromDatabase();
    
    // Set up interval for checking war status
    this.monitorInterval = setInterval(() => this.checkAllWars(), this.checkInterval);
    
    // Perform initial check
    await this.checkAllWars();
    
    log.info('War monitoring started successfully');
    return true;
  }

  /**
   * Load active wars from database into memory
   */
  async loadActiveWarsFromDatabase() {
    try {
      // Find all active wars in the database
      const activeWars = await WarTracking.find({ isActive: true });
      log.info(`Found ${activeWars.length} active wars in database`);
      
      for (const war of activeWars) {
        // Initialize base calls map for this clan
        this.baseCalls.set(war.clanTag, new Map());
        
        // Load base calls from database
        if (war.baseCalls && war.baseCalls.length > 0) {
          for (const call of war.baseCalls) {
            this.baseCalls.get(war.clanTag).set(call.baseNumber, {
              discordId: call.calledBy,
              name: call.calledByName,
              timeReserved: call.timeReserved,
              note: call.note,
              playerTag: call.playerTag,
              attacked: call.attacked || false,
              attackResult: call.attackResult
            });
          }
        }
        
        // Get fresh war data from API
        try {
          const freshWarData = await clashApiService.getCurrentWar(war.clanTag);
          if (freshWarData && freshWarData.state !== 'notInWar') {
            this.activeWars.set(war.clanTag, freshWarData);
            log.info(`Loaded active war for ${war.clanTag} in state: ${freshWarData.state}`);
          } else {
            // War is no longer active, mark as inactive in database
            await WarTracking.findByIdAndUpdate(war._id, { isActive: false });
            log.info(`War for ${war.clanTag} is no longer active, marked as inactive`);
          }
        } catch (error) {
          log.error(`Error loading fresh war data for ${war.clanTag}:`, { error: error.message });
        }
      }
    } catch (error) {
      log.error('Error loading active wars from database:', { error: error.message });
    }
  }

  /**
   * Check all clans for active wars
   */
  async checkAllWars() {
    try {
      // Get all registered clans
      const clans = await Clan.find({});
      log.info(`Checking war status for ${clans.length} clans`);
      
      for (const clan of clans) {
        await this.checkClanWar(clan);
      }
    } catch (error) {
      log.error('Error checking wars:', { error: error.message });
    }
  }

  /**
   * Check a specific clan's war
   * @param {Object} clan - Clan document from database
   */
  async checkClanWar(clan) {
    try {
      // Check if we're already tracking this clan's war
      const isTracking = this.activeWars.has(clan.clanTag);
      
      // Get current war data
      const warData = await clashApiService.getCurrentWar(clan.clanTag);
      
      // If no war or not in war, remove from tracking if needed
      if (!warData || warData.state === 'notInWar') {
        if (isTracking) {
          log.info(`Clan ${clan.name} is no longer in war, removing from tracking`);
          this.activeWars.delete(clan.clanTag);
          this.baseCalls.delete(clan.clanTag);
          
          // Mark war as inactive in database
          await WarTracking.findOneAndUpdate(
            { clanTag: clan.clanTag, isActive: true },
            { isActive: false, state: 'notInWar' }
          );
          
          // Send war ended notification if not already sent
          await this.sendWarEndedNotification(clan, null);
        }
        return;
      }
      
      // Check if this is a new war
      if (!isTracking && warData.state) {
        log.info(`New war detected for ${clan.name} in state: ${warData.state}`);
        this.activeWars.set(clan.clanTag, warData);
        this.baseCalls.set(clan.clanTag, new Map());
        
        // Send notifications based on war state
        if (warData.state === 'preparation') {
          await this.sendWarPreparationNotification(clan, warData);
        } else if (warData.state === 'inWar') {
          await this.sendWarStartedNotification(clan, warData);
        }
        
        // Initialize war tracking in database
        await this.initializeWarTracking(clan, warData);
        return;
      }
      
      // Check for state changes
      if (isTracking) {
        const previousState = this.activeWars.get(clan.clanTag).state;
        const currentState = warData.state;
        
        if (previousState !== currentState) {
          log.info(`War state changed for ${clan.name}: ${previousState} -> ${currentState}`);
          
          // Handle state transitions
          if (currentState === 'inWar' && previousState === 'preparation') {
            await this.sendWarStartedNotification(clan, warData);
            
            // Update database state
            await WarTracking.findOneAndUpdate(
              { clanTag: clan.clanTag, isActive: true },
              { state: 'inWar', startTime: new Date() }
            );
          } else if (currentState === 'warEnded') {
            await this.handleWarEnded(clan, warData);
          }
        }
        
        // Update stored war data
        this.activeWars.set(clan.clanTag, warData);
        
        // Check for attack updates and send notifications
        await this.checkAttackUpdates(clan, warData);
      }
    } catch (error) {
      log.error(`Error checking war for ${clan.name}:`, { error: error.message });
    }
  }

  /**
   * Initialize war tracking in database
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data from API
   */
  async initializeWarTracking(clan, warData) {
    try {
      // Generate war ID
      const warId = `${clan.clanTag}-${warData.opponent.tag}-${warData.preparationStartTime}`;
      
      // Check if this war is already tracked
      const existingWar = await WarTracking.findOne({ warId });
      if (existingWar) {
        log.info(`War ${warId} already exists in database, updating active status`);
        await WarTracking.findByIdAndUpdate(existingWar._id, { 
          isActive: true,
          state: warData.state
        });
        return existingWar;
      }
      
      // Process members data
      const membersData = warData.clan.members.map(member => ({
        playerTag: member.tag,
        name: member.name,
        townhallLevel: member.townhallLevel,
        mapPosition: member.mapPosition,
        attacks: [],
        attacksUsed: 0,
        starsEarned: 0
      }));
      
      // Create new war tracking entry
      const newWar = new WarTracking({
        clanTag: clan.clanTag,
        guildId: clan.guildId,
        warId,
        state: warData.state,
        preparationStartTime: warData.preparationStartTime ? new Date(warData.preparationStartTime) : new Date(),
        startTime: warData.startTime ? new Date(warData.startTime) : null,
        endTime: warData.endTime ? new Date(warData.endTime) : null,
        warSize: warData.teamSize,
        opponent: {
          name: warData.opponent.name,
          tag: warData.opponent.tag,
          level: warData.opponent.clanLevel,
          stars: warData.opponent.stars || 0,
          destruction: warData.opponent.destructionPercentage || 0
        },
        members: membersData,
        isActive: true
      });
      
      await newWar.save();
      log.info(`Created new war tracking entry: ${warId}`);
      
      return newWar;
    } catch (error) {
      log.error(`Error initializing war tracking for ${clan.name}:`, { error: error.message });
      throw error;
    }
  }
  
  /**
   * Check for attack updates in a war
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data from API
   */
  async checkAttackUpdates(clan, warData) {
    try {
      // Get war from database
      const warTracking = await WarTracking.findOne({ 
        clanTag: clan.clanTag, 
        isActive: true 
      });
      
      if (!warTracking) {
        log.warn(`No active war found in database for ${clan.name}`);
        return;
      }
      
      // Check for new attacks by clan members
      const newAttacks = [];
      let anyNewAttacks = false;
      
      // Process each member's attacks
      for (const member of warData.clan.members) {
        if (!member.attacks) continue;
        
        const dbMember = warTracking.members.find(m => m.playerTag === member.tag);
        if (!dbMember) continue;
        
        for (const attack of member.attacks) {
          // Check if this attack is already tracked
          const attackExists = dbMember.attacks.some(a => 
            a.defenderTag === attack.defenderTag && 
            a.stars === attack.stars && 
            a.destructionPercentage === attack.destructionPercentage
          );
          
          if (!attackExists) {
            anyNewAttacks = true;
            
            // Get defender details
            const defender = warData.opponent.members.find(m => m.tag === attack.defenderTag);
            
            // Create attack record
            const attackRecord = {
              attackerTag: member.tag,
              attackerName: member.name,
              attackerTownhallLevel: member.townhallLevel,
              defenderTag: attack.defenderTag,
              defenderName: defender ? defender.name : 'Unknown',
              defenderTownhallLevel: defender ? defender.townhallLevel : 0,
              baseNumber: defender ? warData.opponent.members.indexOf(defender) + 1 : 0,
              stars: attack.stars,
              destructionPercentage: attack.destructionPercentage,
              attackTime: new Date()
            };
            
            // Add to the list of new attacks
            newAttacks.push({
              memberTag: member.tag,
              attack: attackRecord
            });
            
            // Send attack notification
            await this.sendAttackNotification(clan, attackRecord);
            
            // Update base calls if this base was called
            await this.updateBaseCallAfterAttack(clan.clanTag, attackRecord);
          }
        }
      }
      
      // If we have new attacks, update the database
      if (anyNewAttacks) {
        // Update each member's attacks
        for (const { memberTag, attack } of newAttacks) {
          // Find the member in the database
          const memberIndex = warTracking.members.findIndex(m => m.playerTag === memberTag);
          if (memberIndex === -1) continue;
          
          // Update attacks, stars earned, and attacks used
          warTracking.members[memberIndex].attacks.push(attack);
          warTracking.members[memberIndex].starsEarned += attack.stars;
          warTracking.members[memberIndex].attacksUsed += 1;
          
          // Update best attack stats
          if (!warTracking.members[memberIndex].bestAttackStars || 
              attack.stars > warTracking.members[memberIndex].bestAttackStars ||
              (attack.stars === warTracking.members[memberIndex].bestAttackStars && 
               attack.destructionPercentage > warTracking.members[memberIndex].bestAttackPercentage)) {
            warTracking.members[memberIndex].bestAttackStars = attack.stars;
            warTracking.members[memberIndex].bestAttackPercentage = attack.destructionPercentage;
          }
        }
        
        // Update overall war statistics
        warTracking.attacksUsed = warTracking.members.reduce((sum, m) => sum + m.attacksUsed, 0);
        warTracking.starsEarned = warTracking.members.reduce((sum, m) => sum + m.starsEarned, 0);
        warTracking.totalDestruction = warData.clan.destructionPercentage || 0;
        
        // Update opponent stats
        warTracking.opponent.stars = warData.opponent.stars || 0;
        warTracking.opponent.destruction = warData.opponent.destructionPercentage || 0;
        
        // Save the updated war tracking
        await warTracking.save();
        log.info(`Updated war tracking with ${newAttacks.length} new attacks for ${clan.name}`);
      }
    } catch (error) {
      log.error(`Error checking attack updates for ${clan.name}:`, { error: error.message });
    }
  }

  /**
   * Update base call status after an attack
   * @param {String} clanTag - Clan tag
   * @param {Object} attackRecord - Attack data
   */
  async updateBaseCallAfterAttack(clanTag, attackRecord) {
    try {
      // Check if this base was called
      const baseCalls = this.baseCalls.get(clanTag);
      if (!baseCalls) return;
      
      const baseNumber = attackRecord.baseNumber;
      const baseCall = baseCalls.get(baseNumber);
      
      if (baseCall) {
        // Update the base call with attack result
        baseCall.attacked = true;
        baseCall.attackResult = {
          stars: attackRecord.stars,
          percentage: attackRecord.destructionPercentage
        };
        
        // Update in database
        await WarTracking.findOneAndUpdate(
          { clanTag, isActive: true, 'baseCalls.baseNumber': baseNumber },
          { 
            $set: { 
              'baseCalls.$.attacked': true,
              'baseCalls.$.attackResult': {
                stars: attackRecord.stars,
                percentage: attackRecord.destructionPercentage
              }
            }
          }
        );
        
        log.info(`Updated base call for base #${baseNumber} after attack`);
      }
    } catch (error) {
      log.error(`Error updating base call:`, { error: error.message });
    }
  }
  
  /**
   * Handle war ended event
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data from API
   */
  async handleWarEnded(clan, warData) {
    try {
      // Determine war result
      let result = 'tie';
      if (warData.clan.stars > warData.opponent.stars) {
        result = 'win';
      } else if (warData.clan.stars < warData.opponent.stars) {
        result = 'lose';
      } else if (warData.clan.destructionPercentage > warData.opponent.destructionPercentage) {
        result = 'win';
      } else if (warData.clan.destructionPercentage < warData.opponent.destructionPercentage) {
        result = 'lose';
      }
      
      // Update war in database
      await WarTracking.findOneAndUpdate(
        { clanTag: clan.clanTag, isActive: true },
        { 
          isActive: false,
          state: 'warEnded',
          result,
          endTime: new Date(),
          'opponent.stars': warData.opponent.stars || 0,
          'opponent.destruction': warData.opponent.destructionPercentage || 0
        }
      );
      
      // Update clan war stats
      const updateField = `warStats.${result}s`;
      await Clan.findOneAndUpdate(
        { clanTag: clan.clanTag },
        { 
          $inc: { [updateField]: 1 },
          $set: { 'warStats.currentWinStreak': result === 'win' ? (clan.warStats?.currentWinStreak || 0) + 1 : 0 }
        }
      );
      
      // If win streak is better than best streak, update it
      if (result === 'win' && (clan.warStats?.currentWinStreak || 0) + 1 > (clan.warStats?.winStreak || 0)) {
        await Clan.findOneAndUpdate(
          { clanTag: clan.clanTag },
          { $set: { 'warStats.winStreak': (clan.warStats?.currentWinStreak || 0) + 1 } }
        );
      }
      
      // Send war ended notification
      await this.sendWarEndedNotification(clan, warData, result);
      
      // Notify war end listeners
      const warTracking = await WarTracking.findOne({ 
        clanTag: clan.clanTag, 
        state: 'warEnded',
        endTime: { $gt: new Date(Date.now() - 1000 * 60 * 60) } // Within the last hour
      });
      
      if (warTracking) {
        this.notifyWarEndListeners(warTracking, result);
      }
      
      log.info(`War ended for ${clan.name} with result: ${result}`);
    } catch (error) {
      log.error(`Error handling war end for ${clan.name}:`, { error: error.message });
    }
  }
  
  /**
   * Add a war end listener
   * @param {Function} listener - Callback function
   */
  addWarEndListener(listener) {
    this.warEndNotifiers.add(listener);
  }
  
  /**
   * Remove a war end listener
   * @param {Function} listener - Callback function
   */
  removeWarEndListener(listener) {
    this.warEndNotifiers.delete(listener);
  }
  
  /**
   * Notify all war end listeners
   * @param {Object} warData - War tracking document
   * @param {String} result - War result
   */
  notifyWarEndListeners(warData, result) {
    for (const listener of this.warEndNotifiers) {
      try {
        listener(warData, result);
      } catch (error) {
        log.error('Error in war end listener:', { error: error.message });
      }
    }
  }
  
  /**
   * Handle base call
   * @param {Interaction} interaction - Discord interaction
   * @param {Number} baseNumber - Base number
   * @param {String} clanTag - Clan tag
   * @param {String} note - Optional note
   */
  async handleBaseCall(interaction, baseNumber, clanTag, note) {
    try {
      // Check if there's an active war
      const warTracking = await WarTracking.findOne({ 
        clanTag, 
        isActive: true
      });
      
      if (!warTracking) {
        return {
          success: false,
          message: 'There is no active war to call bases for.'
        };
      }
      
      // Get war data and validate base number
      const warData = this.activeWars.get(clanTag);
      if (!warData) {
        return {
          success: false,
          message: 'War data not found. Please try again later.'
        };
      }
      
      // Validate base number
      if (baseNumber < 1 || baseNumber > (warData.opponent.members?.length || 0)) {
        return {
          success: false,
          message: `Invalid base number. Valid range: 1-${warData.opponent.members?.length || 0}`
        };
      }
      
      // Get base calls for this clan
      if (!this.baseCalls.has(clanTag)) {
        this.baseCalls.set(clanTag, new Map());
      }
      const baseCalls = this.baseCalls.get(clanTag);
      
      // Check if base is already called
      if (baseCalls.has(baseNumber)) {
        const currentCall = baseCalls.get(baseNumber);
        
        // If called by same person, they can uncall it
        if (currentCall.discordId === interaction.user.id) {
          baseCalls.delete(baseNumber);
          
          // Remove from database
          await WarTracking.findOneAndUpdate(
            { clanTag, isActive: true },
            { $pull: { baseCalls: { baseNumber } } }
          );
          
          return {
            success: true,
            message: `Your call on base #${baseNumber} has been removed.`,
            uncalled: true
          };
        }
        
        return {
          success: false,
          message: `Base #${baseNumber} is already called by ${currentCall.name}.`
        };
      }
      
      // Get member's linked player tag if available
      let playerTag = null;
      try {
        const User = require('../models/User');
        const user = await User.findOne({ discordId: interaction.user.id });
        if (user && user.playerTag) {
          playerTag = user.playerTag;
        }
      } catch (error) {
        log.error('Error fetching user:', { error: error.message });
      }
      
      // Register the base call
      const newCall = {
        discordId: interaction.user.id,
        name: interaction.user.username,
        timeReserved: new Date(),
        note: note || null,
        playerTag,
        attacked: false,
        attackResult: null
      };
      
      baseCalls.set(baseNumber, newCall);
      
      // Save to database
      await WarTracking.findOneAndUpdate(
        { clanTag, isActive: true },
        { 
          $push: { 
            baseCalls: {
              baseNumber,
              calledBy: interaction.user.id,
              calledByName: interaction.user.username,
              timeReserved: new Date(),
              note: note || null,
              playerTag,
              attacked: false
            }
          }
        }
      );
      
      return {
        success: true,
        message: `You have successfully called base #${baseNumber}.${note ? ' Note: ' + note : ''}`,
        baseNumber
      };
    } catch (error) {
      log.error('Error handling base call:', { error: error.message });
      return {
        success: false,
        message: 'An error occurred while processing your base call. Please try again.'
      };
    }
  }
  
  /**
   * Get current war status
   * @param {String} clanTag - Clan tag
   */
  async getWarStatus(clanTag) {
    try {
      // Get active war from database
      const warTracking = await WarTracking.findOne({
        clanTag,
        isActive: true
      });
      
      // If no active war in database, fetch from API
      if (!warTracking) {
        const warData = await clashApiService.getCurrentWar(clanTag);
        
        if (!warData || warData.state === 'notInWar') {
          return {
            inWar: false,
            message: 'Not currently in war'
          };
        }
        
        // If war found in API but not in database, initialize it
        const clan = await Clan.findOne({ clanTag });
        if (clan) {
          await this.initializeWarTracking(clan, warData);
          this.activeWars.set(clanTag, warData);
        }
        
        return {
          inWar: true,
          state: warData.state,
          data: warData
        };
      }
      
      // Get fresh data from cache if available
      const cachedData = this.activeWars.get(clanTag);
      
      return {
        inWar: true,
        state: warTracking.state,
        data: cachedData || warTracking,
        tracking: warTracking
      };
    } catch (error) {
      log.error('Error getting war status:', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate war map embed
   * @param {String} clanTag - Clan tag
   */
  async generateWarMapEmbed(clanTag) {
    try {
      // Get war status
      const warStatus = await this.getWarStatus(clanTag);
      
      if (!warStatus.inWar) {
        return new EmbedBuilder()
          .setTitle('No Active War')
          .setDescription('There is no active war at the moment.')
          .setColor('#7289da');
      }
      
      const clan = await Clan.findOne({ clanTag });
      const warData = warStatus.data;
      const tracking = warStatus.tracking;
      
      // Get base calls
      const baseCalls = this.baseCalls.get(clanTag) || new Map();
      
      const embed = new EmbedBuilder()
        .setTitle(`War Map: ${warData.clan.name} vs ${warData.opponent.name}`)
        .setDescription(`${warData.teamSize}v${warData.teamSize} War - ${this.formatWarState(warData.state)}`)
        .setColor(this.getWarStateColor(warData.state));
        
      // Add timing information
      if (warData.state === 'preparation') {
        const startTime = new Date(warData.startTime);
        const timeUntil = startTime - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        embed.addFields({ 
          name: 'Preparation Time Remaining', 
          value: `${hoursUntil}h ${minutesUntil}m`
        });
      } else if (warData.state === 'inWar') {
        const endTime = new Date(warData.endTime);
        const timeUntil = endTime - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        embed.addFields({ 
          name: 'Battle Time Remaining', 
          value: `${hoursUntil}h ${minutesUntil}m`
        });
      }
        
      // Add opponent bases with call status
      let baseList = '';
      
      // Sort opponent bases by position
      const sortedBases = [...warData.opponent.members].sort((a, b) => a.mapPosition - b.mapPosition);
      
      for (let i = 0; i < sortedBases.length; i++) {
        const member = sortedBases[i];
        const baseNumber = member.mapPosition;
        
        // Check if base is called
        const isCalled = baseCalls.has(baseNumber);
        const baseCall = isCalled ? baseCalls.get(baseNumber) : null;
        const callerInfo = isCalled ? ` - Called by: ${baseCall.name}` : '';
        
        // Check if base has been attacked
        let attackInfo = '';
        if (warData.clan && warData.clan.members) {
          const clanMemberAttacks = warData.clan.members.flatMap(m => m.attacks || []);
          const attacksOnBase = clanMemberAttacks.filter(a => a.defenderTag === member.tag);
          
          if (attacksOnBase.length > 0) {
            const bestAttack = attacksOnBase.sort((a, b) => b.stars - a.stars || b.destructionPercentage - a.destructionPercentage)[0];
            attackInfo = ` [${bestAttack.stars}⭐ ${bestAttack.destructionPercentage}%]`;
          }
        }
        
        // Show note if available
        const noteInfo = baseCall && baseCall.note ? ` - Note: *${baseCall.note}*` : '';
        
        // Get appropriate status emoji
        let statusEmoji;
        if (attackInfo) {
          statusEmoji = '✅'; // Attacked
        } else if (isCalled) {
          statusEmoji = '🔒'; // Called but not attacked
        } else {
          statusEmoji = '⬜'; // Available
        }
        
        baseList += `${statusEmoji} **#${baseNumber}** - TH${member.townhallLevel}${callerInfo}${attackInfo}${noteInfo}\n`;
      }
      
      embed.addFields({ 
        name: 'Opponent Bases', 
        value: baseList || 'No bases found'
      });
      
      // Add war status
      embed.addFields(
        { name: 'War Status', value: `${warData.clan.stars || 0}⭐ vs ${warData.opponent.stars || 0}⭐`, inline: true },
        { name: 'Destruction', value: `${warData.clan.destructionPercentage?.toFixed(2) || 0}% vs ${warData.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
      );
      
      // Add attack usage
      const totalAttacks = warData.teamSize * 2;
      const usedAttacks = tracking?.attacksUsed || warData.clan.attacks || 0;
      const remainingAttacks = totalAttacks - usedAttacks;
      
      embed.addFields({
        name: 'Attacks',
        value: `Used: ${usedAttacks}/${totalAttacks} | Remaining: ${remainingAttacks}`,
        inline: true
      });
      
      return embed;
    } catch (error) {
      log.error('Error generating war map embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading War Map')
        .setDescription('An error occurred while loading the war map. Please try again later.')
        .setColor('#e74c3c');
    }
  }
  
  /**
   * Format war state for display
   * @param {String} state - War state
   */
  formatWarState(state) {
    switch (state) {
      case 'preparation':
        return '⏳ Preparation Day';
      case 'inWar':
        return '⚔️ Battle Day';
      case 'warEnded':
        return '🏁 War Ended';
      default:
        return state;
    }
  }
  
  /**
   * Get color for war state
   * @param {String} state - War state
   */
  getWarStateColor(state) {
    switch (state) {
      case 'preparation':
        return '#f1c40f'; // Yellow
      case 'inWar':
        return '#e67e22'; // Orange
      case 'warEnded':
        return '#2ecc71'; // Green
      default:
        return '#7289da'; // Discord Blurple
    }
  }
  
  // Notification methods would be implemented here, connecting to Discord channels
  // For brevity, these implementation details are omitted but would include:
  // - sendWarPreparationNotification
  // - sendWarStartedNotification
  // - sendAttackNotification
  // - sendWarEndedNotification
  
  /**
   * Send war preparation notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   */
  async sendWarPreparationNotification(clan, warData) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'warAnnouncements');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🔍 War Preparation Day Started!')
        .setDescription(`War has been found against **${warData.opponent.name}**!`)
        .setColor('#f1c40f')
        .addFields(
          { name: 'War Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true },
          { name: 'Opponent Level', value: `Clan Level ${warData.opponent.clanLevel}`, inline: true }
        )
        .setFooter({ text: 'Use /war call to reserve bases for attack' })
        .setTimestamp();
        
      // Calculate time until battle day
      const startTime = new Date(warData.startTime);
      const timeUntil = startTime - new Date();
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      
      embed.addFields({ 
        name: 'Battle Day Starts In', 
        value: `${hoursUntil}h ${minutesUntil}m`
      });
      
      await channel.send({ 
        content: '@everyone War has been matched! Preparation day has begun.',
        embeds: [embed]
      });
      
      log.info(`Sent war preparation notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending war preparation notification:`, { error: error.message });
    }
  }
  
  /**
   * Send war started notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   */
  async sendWarStartedNotification(clan, warData) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'warAnnouncements');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('⚔️ War Battle Day Has Started!')
        .setDescription(`The battle horns have sounded! War against **${warData.opponent.name}** has begun!`)
        .setColor('#e67e22')
        .addFields(
          { name: 'War Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true }
        )
        .setFooter({ text: 'Use /war map to see the current war status' })
        .setTimestamp();
        
      // Calculate time until war ends
      const endTime = new Date(warData.endTime);
      const timeUntil = endTime - new Date();
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      
      embed.addFields({ 
        name: 'Battle Ends In', 
        value: `${hoursUntil}h ${minutesUntil}m`
      });
      
      await channel.send({ 
        content: '@everyone War battle day has started! Time to attack!',
        embeds: [embed]
      });
      
      log.info(`Sent war started notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending war started notification:`, { error: error.message });
    }
  }
  
  /**
   * Send attack notification
   * @param {Object} clan - Clan document
   * @param {Object} attack - Attack data
   */
  async sendAttackNotification(clan, attack) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'attackTracker');
      if (!channel) return;
      
      // Determine emoji based on stars
      let starsEmoji = '';
      if (attack.stars === 3) starsEmoji = '🌟';
      else if (attack.stars === 2) starsEmoji = '⭐⭐';
      else if (attack.stars === 1) starsEmoji = '⭐';
      else starsEmoji = '💢';
      
      const embed = new EmbedBuilder()
        .setTitle(`${starsEmoji} Attack Result`)
        .setDescription(`**${attack.attackerName}** (TH${attack.attackerTownhallLevel}) attacked **${attack.defenderName}** (TH${attack.defenderTownhallLevel})`)
        .setColor(attack.stars === 3 ? '#2ecc71' : attack.stars >= 1 ? '#f1c40f' : '#e74c3c')
        .addFields(
          { name: 'Stars', value: `${attack.stars}/3`, inline: true },
          { name: 'Destruction', value: `${attack.destructionPercentage.toFixed(2)}%`, inline: true },
          { name: 'Base Number', value: `#${attack.baseNumber}`, inline: true }
        )
        .setTimestamp();
      
      await channel.send({ embeds: [embed] });
      
      log.info(`Sent attack notification for ${attack.attackerName}`);
    } catch (error) {
      log.error(`Error sending attack notification:`, { error: error.message });
    }
  }
  
  /**
   * Send war ended notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   * @param {String} result - War result
   */
  async sendWarEndedNotification(clan, warData, result) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'warAnnouncements');
      if (!channel) return;
      
      // If no warData, try to get from database
      if (!warData) {
        const warTracking = await WarTracking.findOne({ 
          clanTag: clan.clanTag, 
          state: 'warEnded',
          endTime: { $gt: new Date(Date.now() - 1000 * 60 * 60 * 24) } // Within the last day
        });
        
        if (warTracking) {
          result = warTracking.result;
        } else {
          // If no data found, exit
          log.warn(`No war data found for ended notification: ${clan.name}`);
          return;
        }
      }
      
      // Determine color and title based on result
      let color, title, description;
      switch (result) {
        case 'win':
          color = '#2ecc71'; // Green
          title = '🏆 War Victory!';
          description = `The halls of ${clan.name} echo with cheers of victory! We have defeated ${warData?.opponent?.name || 'our enemies'}!`;
          break;
        case 'lose':
          color = '#e74c3c'; // Red
          title = '😔 War Defeat';
          description = `Our warriors fought valiantly, but ${warData?.opponent?.name || 'the enemy'} has prevailed. We shall train harder for the next battle!`;
          break;
        default: // Tie
          color = '#f39c12'; // Orange
          title = '🤝 War Ended in a Tie!';
          description = `An incredible display of equal might! Our battle with ${warData?.opponent?.name || 'the enemy'} ends in a tie!`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
        
      if (warData) {
        embed.addFields(
          { name: `${warData.clan.name} Stars`, value: `⭐ ${warData.clan.stars || 0}`, inline: true },
          { name: `${warData.opponent.name} Stars`, value: `⭐ ${warData.opponent.stars || 0}`, inline: true },
          { name: `${warData.clan.name} Destruction`, value: `${warData.clan.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: `${warData.opponent.name} Destruction`, value: `${warData.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
        );
      }
      
      // Get top performers
      const warTracking = await WarTracking.findOne({ 
        clanTag: clan.clanTag, 
        state: 'warEnded',
        endTime: { $gt: new Date(Date.now() - 1000 * 60 * 60 * 24) } // Within the last day
      });
      
      if (warTracking && warTracking.members.length > 0) {
        // Sort members by stars earned
        const topPerformers = [...warTracking.members]
          .filter(m => m.attacksUsed > 0)
          .sort((a, b) => {
            // Sort by stars, then by destruction percentage
            if (b.starsEarned !== a.starsEarned) return b.starsEarned - a.starsEarned;
            if (b.bestAttackStars !== a.bestAttackStars) return b.bestAttackStars - a.bestAttackStars;
            return b.bestAttackPercentage - a.bestAttackPercentage;
          })
          .slice(0, 3);
          
        if (topPerformers.length > 0) {
          let performersText = '';
          topPerformers.forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            performersText += `${medal} **${member.name}**: ${member.starsEarned} stars in ${member.attacksUsed} attacks\n`;
          });
          
          embed.addFields({ name: 'Top Performers', value: performersText });
        }
      }
      
      await channel.send({ 
        content: `@everyone War has ended with a ${result.toUpperCase()}!`,
        embeds: [embed]
      });
      
      log.info(`Sent war ended notification for ${clan.name} with result: ${result}`);
    } catch (error) {
      log.error(`Error sending war ended notification:`, { error: error.message });
    }
  }
  
  /**
   * Find appropriate channel for notifications
   * @param {Object} clan - Clan document
   * @param {String} type - Channel type
   */
  async findAppropriateChannel(clan, type) {
    try {
      // Get Discord client
      const client = global.client;
      if (!client) {
        log.error('Discord client not found in global scope');
        return null;
      }
      
      // Find the guild
      const guild = client.guilds.cache.get(clan.guildId);
      if (!guild) {
        log.error(`Guild not found: ${clan.guildId}`);
        return null;
      }
      
      // Get channel ID from clan settings
      const channelId = clan.channels?.[type];
      
      // If channel ID is set and valid, use it
      if (channelId) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (channel) return channel;
        } catch (error) {
          log.warn(`Could not fetch channel ${channelId}:`, { error: error.message });
        }
      }
      
      // Fall back to channel name matching
      const channelNames = {
        warAnnouncements: ['war-announcements', 'war-status', 'war-log'],
        attackTracker: ['attack-tracker', 'war-attacks', 'attacks'],
        baseCalling: ['base-calling', 'war-bases', 'bases'],
        warPlanning: ['war-planning', 'war-strategy', 'strategy']
      };
      
      const names = channelNames[type] || [];
      
      for (const name of names) {
        const channel = guild.channels.cache.find(c => c.name === name);
        if (channel) return channel;
      }
      
      log.warn(`No appropriate channel found for ${type} in guild ${guild.id}`);
      return null;
    } catch (error) {
      log.error(`Error finding appropriate channel:`, { error: error.message });
      return null;
    }
  }
}

module.exports = new WarTrackingService();
