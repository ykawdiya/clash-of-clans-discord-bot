// src/services/cwlTrackingService.js
const { EmbedBuilder } = require('discord.js');
const CWLTracking = require('../models/CWLTracking');
const Clan = require('../models/Clan');
const User = require('../models/User');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

class CwlTrackingService {
  constructor() {
    // Initialize tracking maps
    this.activeSeasons = new Map();
    this.rosterUpdates = new Map();
    this.checkInterval = 6 * 60 * 60 * 1000; // 6 hours
    this.monitorInterval = null;
    
    // Initialize seasonal date tracking
    this.lastSeasonCheck = new Date();
    this.seasonStartDates = [];
    this.calculateSeasonDates();
  }

  /**
   * Calculate CWL season dates for the year
   */
  calculateSeasonDates() {
    const currentYear = new Date().getFullYear();
    
    // CWL seasons typically start on the first Monday of the month
    for (let month = 0; month < 12; month++) {
      let date = new Date(currentYear, month, 1);
      
      // Find the first Monday
      while (date.getDay() !== 1) { // 1 = Monday
        date.setDate(date.getDate() + 1);
      }
      
      // Season starts 2-3 days before the first Monday (around Friday/Saturday)
      const seasonStart = new Date(date);
      seasonStart.setDate(seasonStart.getDate() - 3);
      
      this.seasonStartDates.push(seasonStart);
    }
    
    log.info(`Calculated ${this.seasonStartDates.length} CWL season dates for ${currentYear}`);
  }

  /**
   * Check if currently in CWL sign-up or active period
   */
  isInCWLPeriod() {
    const now = new Date();
    
    // Check if we're within 10 days of any season start
    for (const startDate of this.seasonStartDates) {
      const daysDiff = Math.abs((now - startDate) / (1000 * 60 * 60 * 24));
      
      // CWL typically runs for about 10 days (signup + 7 war days + results)
      if (daysDiff <= 10) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if currently in CWL sign-up period
   */
  isInSignupPhase() {
    const now = new Date();
    
    // Check if we're within 2 days of any season start
    for (const startDate of this.seasonStartDates) {
      const daysDiff = (now - startDate) / (1000 * 60 * 60 * 24);
      
      // Sign-up is typically 2 days before war days begin
      if (daysDiff >= -0.5 && daysDiff <= 2) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if CWL has ended
   */
  isCWLEnded() {
    const now = new Date();
    
    // Check if we're more than 10 days past any season start
    for (const startDate of this.seasonStartDates) {
      const daysDiff = (now - startDate) / (1000 * 60 * 60 * 24);
      
      // CWL typically runs for about 10 days
      if (daysDiff > 0 && daysDiff <= 10) {
        return false; // Still in active season
      }
    }
    
    return true;
  }

  /**
   * Start monitoring CWL for all registered clans
   */
  async startCWLMonitoring() {
    log.info('Starting CWL monitoring service');
    
    // Clear any existing interval
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Load any active seasons from database first
    await this.loadActiveSeasonsFromDatabase();
    
    // Set up interval for checking CWL status
    this.monitorInterval = setInterval(() => this.checkAllClans(), this.checkInterval);
    
    // Perform initial check
    await this.checkAllClans();
    
    log.info('CWL monitoring started successfully');
    return true;
  }

  /**
   * Load active CWL seasons from database into memory
   */
  async loadActiveSeasonsFromDatabase() {
    try {
      // Find all active CWL seasons in the database
      const activeSeasons = await CWLTracking.find({ isActive: true });
      log.info(`Found ${activeSeasons.length} active CWL seasons in database`);
      
      for (const season of activeSeasons) {
        // Store in memory
        this.activeSeasons.set(season.clanTag, {
          clanTag: season.clanTag,
          guildId: season.guildId,
          season: season.season,
          league: season.league,
          currentDay: season.currentDay,
          roster: new Set(season.roster),
          memberPerformance: new Map()
        });
        
        // Initialize member performance tracking
        if (season.members && season.members.length > 0) {
          for (const member of season.members) {
            this.activeSeasons.get(season.clanTag).memberPerformance.set(member.playerTag, {
              name: member.name,
              townhallLevel: member.townhallLevel,
              attacksUsed: member.attacksUsed,
              starsEarned: member.starsEarned,
              totalDestruction: member.totalDestruction
            });
          }
        }
        
        log.info(`Loaded active CWL season for ${season.clanTag}: ${season.season}, day ${season.currentDay}`);
      }
    } catch (error) {
      log.error('Error loading active CWL seasons from database:', { error: error.message });
    }
  }

  /**
   * Check all clans for CWL status
   */
  async checkAllClans() {
    try {
      // Get all registered clans
      const clans = await Clan.find({});
      log.info(`Checking CWL status for ${clans.length} clans`);
      
      // Check if we're in CWL period before checking individual clans
      const isInCWLPeriod = this.isInCWLPeriod();
      
      if (!isInCWLPeriod) {
        log.info('Not currently in CWL period, skipping individual clan checks');
        return;
      }
      
      for (const clan of clans) {
        await this.checkClanCWL(clan);
      }
    } catch (error) {
      log.error('Error checking CWL status:', { error: error.message });
    }
  }

  /**
   * Check a specific clan's CWL status
   * @param {Object} clan - Clan document
   */
  async checkClanCWL(clan) {
    try {
      // Get current war data to detect CWL
      const warData = await clashApiService.getCurrentWar(clan.clanTag);
      
      // CWL detection logic
      const isCWL = warData && warData.clan && warData.opponent && 
                    (warData.warLeague || // API directly indicates it's a CWL war
                     (warData.clan.members?.length > warData.teamSize)); // Clan members > war size means it's likely CWL
      
      const isSignupPhase = this.isInSignupPhase();
      
      // If in signup phase and not tracking yet, create new season
      if (isSignupPhase && !this.activeSeasons.has(clan.clanTag)) {
        log.info(`CWL sign-up period detected for ${clan.name}`);
        await this.sendCWLSignupNotification(clan);
        
        // Create new CWL season tracking
        const newSeason = this.createNewSeason(clan.clanTag, clan.guildId);
        this.activeSeasons.set(clan.clanTag, newSeason);
        
        // Save to database
        await this.saveCWLSeason(clan.clanTag);
        return;
      }
      
      // If CWL war is active but not tracking yet, create new season
      if (isCWL && !this.activeSeasons.has(clan.clanTag)) {
        log.info(`CWL season started for ${clan.name}`);
        const league = warData.warLeague?.name || 'Unknown League';
        const newSeason = this.createNewSeason(clan.clanTag, clan.guildId, league);
        this.activeSeasons.set(clan.clanTag, newSeason);
        
        await this.sendCWLStartedNotification(clan, warData);
        
        // Save to database
        await this.saveCWLSeason(clan.clanTag);
        return;
      }
      
      // If we're tracking a season, check for updates
      if (this.activeSeasons.has(clan.clanTag)) {
        const cwlSeason = this.activeSeasons.get(clan.clanTag);
        
        // If in CWL and there's a war, check if it's a new day
        if (isCWL && warData) {
          // Get current CWL day (counting wars with different opponents)
          const warDay = await this.identifyWarDay(clan.clanTag, warData);
          
          if (warDay > cwlSeason.currentDay) {
            log.info(`New CWL war day detected for ${clan.name}: Day ${warDay}`);
            cwlSeason.currentDay = warDay;
            
            await this.sendCWLDayStartedNotification(clan, warData, warDay);
            
            // Update CWL day in database
            await this.updateCWLDay(clan.clanTag, warDay, warData);
          }
          
          // Track any changes in the current war
          await this.trackCWLWarChanges(clan.clanTag, warDay, warData);
        }
        
        // Check if CWL has ended (after day 7 or no longer in CWL period)
        const isCWLEnded = cwlSeason.currentDay >= 7 || this.isCWLEnded();
        
        if (isCWLEnded && !warData) {
          log.info(`CWL has ended for ${clan.name}`);
          await this.handleCWLEnded(clan, cwlSeason);
          
          // Remove from tracking
          this.activeSeasons.delete(clan.clanTag);
        }
      }
    } catch (error) {
      log.error(`Error checking CWL for ${clan.name}:`, { error: error.message });
    }
  }

  /**
   * Create a new CWL season tracking object
   * @param {String} clanTag - Clan tag
   * @param {String} guildId - Guild ID
   * @param {String} league - League name
   */
  createNewSeason(clanTag, guildId, league = null) {
    const currentDate = new Date();
    const month = currentDate.toLocaleString('default', { month: 'long' });
    const year = currentDate.getFullYear();
    
    return {
      clanTag,
      guildId,
      season: `${month} ${year}`,
      league: league || 'Unknown League',
      currentDay: 0,
      roster: new Set(),
      memberPerformance: new Map()
    };
  }

  /**
   * Save CWL season to database
   * @param {String} clanTag - Clan tag
   */
  async saveCWLSeason(clanTag) {
    try {
      const seasonData = this.activeSeasons.get(clanTag);
      if (!seasonData) return;
      
      // Convert roster Set to Array
      const rosterArray = Array.from(seasonData.roster);
      
      // Convert memberPerformance Map to Array
      const membersArray = [];
      seasonData.memberPerformance.forEach((data, playerTag) => {
        membersArray.push({
          playerTag,
          name: data.name,
          townhallLevel: data.townhallLevel,
          attacksUsed: data.attacksUsed || 0,
          starsEarned: data.starsEarned || 0,
          totalDestruction: data.totalDestruction || 0
        });
      });
      
      // Update or create season in database
      await CWLTracking.findOneAndUpdate(
        { clanTag, season: seasonData.season },
        {
          clanTag: seasonData.clanTag,
          guildId: seasonData.guildId,
          season: seasonData.season,
          league: seasonData.league,
          currentDay: seasonData.currentDay,
          roster: rosterArray,
          members: membersArray,
          isActive: true,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      log.info(`Saved CWL season for ${clanTag}: ${seasonData.season}`);
    } catch (error) {
      log.error(`Error saving CWL season for ${clanTag}:`, { error: error.message });
    }
  }

  /**
   * Identify the current CWL war day
   * @param {String} clanTag - Clan tag
   * @param {Object} warData - War data
   */
  async identifyWarDay(clanTag, warData) {
    try {
      if (!warData || !warData.opponent) return 0;
      
      // Get CWL tracking
      const cwlTracking = await CWLTracking.findOne({
        clanTag,
        isActive: true
      });
      
      if (!cwlTracking) return 1; // First day if no tracking
      
      // Check if we've already seen this opponent
      const matchingDay = cwlTracking.warDays.find(day => 
        day.opponent.tag === warData.opponent.tag
      );
      
      if (matchingDay) {
        return matchingDay.day;
      }
      
      // If war isn't in our records, it's a new day
      return cwlTracking.currentDay + 1;
    } catch (error) {
      log.error(`Error identifying CWL war day:`, { error: error.message });
      return 0;
    }
  }

  /**
   * Update CWL day in database
   * @param {String} clanTag - Clan tag
   * @param {Number} warDay - War day
   * @param {Object} warData - War data
   */
  async updateCWLDay(clanTag, warDay, warData) {
    try {
      // Check if we have season data
      const seasonData = this.activeSeasons.get(clanTag);
      if (!seasonData) return;
      
      // Update day in memory
      seasonData.currentDay = warDay;
      
      // Get CWL tracking from database
      const cwlTracking = await CWLTracking.findOne({
        clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        log.warn(`No active CWL tracking found for ${clanTag}`);
        return;
      }
      
      // Check if this war day already exists
      const existingDayIndex = cwlTracking.warDays.findIndex(day => day.day === warDay);
      if (existingDayIndex >= 0) {
        // Update existing day
        cwlTracking.warDays[existingDayIndex] = {
          day: warDay,
          opponent: {
            name: warData.opponent.name,
            tag: warData.opponent.tag
          },
          startTime: warData.startTime ? new Date(warData.startTime) : new Date(),
          endTime: warData.endTime ? new Date(warData.endTime) : null,
          outcome: 'ongoing',
          stars: warData.clan.stars || 0,
          opponentStars: warData.opponent.stars || 0,
          destruction: warData.clan.destructionPercentage || 0,
          opponentDestruction: warData.opponent.destructionPercentage || 0,
          attacksUsed: 0
        };
      } else {
        // Add new war day
        cwlTracking.warDays.push({
          day: warDay,
          opponent: {
            name: warData.opponent.name,
            tag: warData.opponent.tag
          },
          startTime: warData.startTime ? new Date(warData.startTime) : new Date(),
          endTime: warData.endTime ? new Date(warData.endTime) : null,
          outcome: 'ongoing',
          stars: warData.clan.stars || 0,
          opponentStars: warData.opponent.stars || 0,
          destruction: warData.clan.destructionPercentage || 0,
          opponentDestruction: warData.opponent.destructionPercentage || 0,
          attacksUsed: 0
        });
      }
      
      // Update current day
      cwlTracking.currentDay = warDay;
      
      await cwlTracking.save();
      log.info(`Updated CWL day ${warDay} for ${clanTag}`);
    } catch (error) {
      log.error(`Error updating CWL day:`, { error: error.message });
    }
  }

  /**
   * Track changes in CWL war
   * @param {String} clanTag - Clan tag
   * @param {Number} warDay - War day
   * @param {Object} warData - War data
   */
  async trackCWLWarChanges(clanTag, warDay, warData) {
    try {
      if (warDay === 0 || !warData || !warData.clan || !warData.clan.members) return;
      
      // Get CWL tracking from database
      const cwlTracking = await CWLTracking.findOne({
        clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        log.warn(`No active CWL tracking found for ${clanTag}`);
        return;
      }
      
      // Find the current war day
      const dayIndex = cwlTracking.warDays.findIndex(day => day.day === warDay);
      if (dayIndex === -1) {
        log.warn(`War day ${warDay} not found in CWL tracking for ${clanTag}`);
        return;
      }
      
      // Get roster and members that participated in this war
      const warParticipants = warData.clan.members.map(m => m.tag);
      
      // Update member stats for this war
      for (const member of warData.clan.members) {
        // Skip if no attacks
        if (!member.attacks) continue;
        
        // Find or create member in database
        let memberIndex = cwlTracking.members.findIndex(m => m.playerTag === member.tag);
        
        if (memberIndex === -1) {
          // If member not in tracking, add them
          cwlTracking.members.push({
            playerTag: member.tag,
            name: member.name,
            townhallLevel: member.townhallLevel,
            inWar: true,
            attacksUsed: 0,
            starsEarned: 0,
            totalDestruction: 0,
            attacks: []
          });
          memberIndex = cwlTracking.members.length - 1;
        }
        
        // Set inWar flag
        cwlTracking.members[memberIndex].inWar = true;
        
        // Process each attack
        for (const attack of member.attacks) {
          // Check if attack already recorded
          const attackExists = cwlTracking.members[memberIndex].attacks.some(a => 
            a.warDay === warDay && 
            a.defenderTag === attack.defenderTag && 
            a.stars === attack.stars && 
            a.destructionPercentage === attack.destructionPercentage
          );
          
          if (!attackExists) {
            // Get defender info
            const defender = warData.opponent.members.find(m => m.tag === attack.defenderTag);
            
            // Record new attack
            cwlTracking.members[memberIndex].attacks.push({
              warDay,
              attackerTag: member.tag,
              attackerName: member.name,
              defenderTag: attack.defenderTag,
              defenderName: defender ? defender.name : 'Unknown',
              defenderClan: warData.opponent.name,
              stars: attack.stars,
              destructionPercentage: attack.destructionPercentage,
              attackTime: new Date()
            });
            
            // Update member stats
            cwlTracking.members[memberIndex].attacksUsed++;
            cwlTracking.members[memberIndex].starsEarned += attack.stars;
            cwlTracking.members[memberIndex].totalDestruction += attack.destructionPercentage;
            
            // Update war day stats
            cwlTracking.warDays[dayIndex].attacksUsed++;
            
            // Update in memory
            if (this.activeSeasons.has(clanTag)) {
              const seasonData = this.activeSeasons.get(clanTag);
              if (!seasonData.memberPerformance.has(member.tag)) {
                seasonData.memberPerformance.set(member.tag, {
                  name: member.name,
                  townhallLevel: member.townhallLevel,
                  attacksUsed: 0,
                  starsEarned: 0,
                  totalDestruction: 0
                });
              }
              
              const performance = seasonData.memberPerformance.get(member.tag);
              performance.attacksUsed++;
              performance.starsEarned += attack.stars;
              performance.totalDestruction += attack.destructionPercentage;
            }
          }
        }
      }
      
      // Update war day results
      cwlTracking.warDays[dayIndex].stars = warData.clan.stars || 0;
      cwlTracking.warDays[dayIndex].opponentStars = warData.opponent.stars || 0;
      cwlTracking.warDays[dayIndex].destruction = warData.clan.destructionPercentage || 0;
      cwlTracking.warDays[dayIndex].opponentDestruction = warData.opponent.destructionPercentage || 0;
      
      // Check if war has ended
      if (warData.state === 'warEnded') {
        log.info(`CWL war day ${warDay} has ended for ${clanTag}`);
        
        // Determine outcome
        let outcome = 'tie';
        if (warData.clan.stars > warData.opponent.stars) {
          outcome = 'win';
        } else if (warData.clan.stars < warData.opponent.stars) {
          outcome = 'lose';
        } else if (warData.clan.destructionPercentage > warData.opponent.destructionPercentage) {
          outcome = 'win';
        } else if (warData.clan.destructionPercentage < warData.opponent.destructionPercentage) {
          outcome = 'lose';
        }
        
        cwlTracking.warDays[dayIndex].outcome = outcome;
        cwlTracking.warDays[dayIndex].endTime = new Date();
        
        // Update war wins count
        if (outcome === 'win') {
          cwlTracking.warWins++;
        }
        
        // Send war ended notification
        const clan = await Clan.findOne({ clanTag });
        if (clan) {
          await this.sendCWLWarEndedNotification(clan, warData, warDay, outcome);
        }
      }
      
      await cwlTracking.save();
      log.info(`Updated CWL war changes for ${clanTag} day ${warDay}`);
    } catch (error) {
      log.error(`Error tracking CWL war changes:`, { error: error.message });
    }
  }

  /**
   * Handle CWL season end
   * @param {Object} clan - Clan document
   * @param {Object} seasonData - Season data
   */
  async handleCWLEnded(clan, seasonData) {
    try {
      // Get CWL tracking from database
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (!cwlTracking) {
        log.warn(`No active CWL tracking found for ${clan.clanTag}`);
        return;
      }
      
      // Calculate final position and medal earnings
      // This would typically be based on war wins and stars
      // Since this is not directly available from the API, we'll estimate it
      const warWins = cwlTracking.warWins || 0;
      let finalPosition = 0;
      let medalEarnings = 0;
      
      // Roughly estimate position based on wins
      switch (warWins) {
        case 7: finalPosition = 1; break;
        case 6: finalPosition = 2; break;
        case 5: finalPosition = 3; break;
        case 4: finalPosition = 4; break;
        case 3: finalPosition = 5; break;
        case 2: finalPosition = 6; break;
        case 1: finalPosition = 7; break;
        case 0: finalPosition = 8; break;
        default: finalPosition = 4; // Middle position if unclear
      }
      
      // Calculate medals based on league and position
      // Reference: https://clashofclans.fandom.com/wiki/Clan_War_Leagues
      const leagueMedals = {
        'Bronze League III': [25, 20, 16, 12, 8, 6, 4, 2],
        'Bronze League II': [35, 30, 22, 18, 14, 10, 6, 2],
        'Bronze League I': [45, 40, 30, 25, 20, 14, 8, 2],
        'Silver League III': [55, 50, 40, 30, 25, 18, 10, 2],
        'Silver League II': [70, 60, 50, 40, 30, 22, 14, 6],
        'Silver League I': [85, 75, 65, 50, 35, 25, 18, 10],
        'Gold League III': [100, 90, 75, 60, 45, 35, 25, 15],
        'Gold League II': [120, 110, 90, 75, 60, 45, 30, 20],
        'Gold League I': [140, 130, 110, 90, 75, 60, 40, 25],
        'Crystal League III': [170, 150, 135, 120, 95, 75, 55, 35],
        'Crystal League II': [190, 170, 150, 135, 110, 90, 70, 45],
        'Crystal League I': [210, 190, 170, 150, 125, 100, 80, 55],
        'Master League III': [240, 220, 200, 180, 160, 140, 120, 100],
        'Master League II': [260, 240, 220, 200, 180, 160, 140, 120],
        'Master League I': [280, 260, 240, 220, 200, 180, 160, 140],
        'Champion League III': [300, 280, 260, 240, 220, 200, 180, 160],
        'Champion League II': [320, 300, 280, 260, 240, 220, 200, 180],
        'Champion League I': [340, 320, 300, 280, 260, 240, 220, 200]
      };
      
      // Get medals based on league and position
      if (leagueMedals[cwlTracking.league]) {
        medalEarnings = leagueMedals[cwlTracking.league][finalPosition - 1] || 0;
      } else {
        // If league not found, use Silver I as default
        medalEarnings = leagueMedals['Silver League I'][finalPosition - 1] || 0;
      }
      
      // Update CWL tracking
      cwlTracking.isActive = false;
      cwlTracking.finalPosition = finalPosition;
      cwlTracking.medalEarnings = medalEarnings;
      
      await cwlTracking.save();
      
      // Update clan CWL stats
      await Clan.findOneAndUpdate(
        { clanTag: clan.clanTag },
        {
          'cwlStats.currentLeague': cwlTracking.league,
          'cwlStats.currentSeason': cwlTracking.season
        }
      );
      
      // Send CWL ended notification
      await this.sendCWLEndedNotification(clan, cwlTracking);
      
      log.info(`CWL season ended for ${clan.clanTag}. Position: ${finalPosition}, Medals: ${medalEarnings}`);
    } catch (error) {
      log.error(`Error handling CWL end:`, { error: error.message });
    }
  }

  /**
   * Add a player to CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   * @param {String} playerTag - Player tag
   */
  async addPlayerToRoster(interaction, clanTag, playerTag) {
    try {
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Check if there's an active CWL season
      if (!this.activeSeasons.has(clanTag)) {
        return {
          success: false,
          message: 'There is no active CWL season.'
        };
      }
      
      // Get player data
      let playerData;
      try {
        playerData = await clashApiService.getPlayer(playerTag);
      } catch (error) {
        return {
          success: false,
          message: 'Player not found. Please check the tag and try again.'
        };
      }
      
      // Add to roster
      const seasonData = this.activeSeasons.get(clanTag);
      seasonData.roster.add(playerTag);
      
      // Add to member performance if not exists
      if (!seasonData.memberPerformance.has(playerTag)) {
        seasonData.memberPerformance.set(playerTag, {
          name: playerData.name,
          townhallLevel: playerData.townHallLevel,
          attacksUsed: 0,
          starsEarned: 0,
          totalDestruction: 0
        });
      }
      
      // Save to database
      await this.saveCWLSeason(clanTag);
      
      return {
        success: true,
        message: `Successfully added ${playerData.name} to the CWL roster.`,
        player: playerData
      };
    } catch (error) {
      log.error('Error adding player to roster:', { error: error.message });
      return {
        success: false,
        message: 'An error occurred while adding the player to the roster.'
      };
    }
  }

  /**
   * Remove a player from CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   * @param {String} playerTag - Player tag
   */
  async removePlayerFromRoster(interaction, clanTag, playerTag) {
    try {
      // Format player tag
      if (!playerTag.startsWith('#')) {
        playerTag = '#' + playerTag;
      }
      playerTag = playerTag.toUpperCase();
      
      // Check if there's an active CWL season
      if (!this.activeSeasons.has(clanTag)) {
        return {
          success: false,
          message: 'There is no active CWL season.'
        };
      }
      
      // Check if player is in roster
      const seasonData = this.activeSeasons.get(clanTag);
      if (!seasonData.roster.has(playerTag)) {
        return {
          success: false,
          message: 'This player is not in the CWL roster.'
        };
      }
      
      // Get player name
      let playerName = playerTag;
      if (seasonData.memberPerformance.has(playerTag)) {
        playerName = seasonData.memberPerformance.get(playerTag).name;
      }
      
      // Remove from roster
      seasonData.roster.delete(playerTag);
      
      // Save to database
      await this.saveCWLSeason(clanTag);
      
      return {
        success: true,
        message: `Successfully removed ${playerName} from the CWL roster.`
      };
    } catch (error) {
      log.error('Error removing player from roster:', { error: error.message });
      return {
        success: false,
        message: 'An error occurred while removing the player from the roster.'
      };
    }
  }

  /**
   * View CWL roster
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   */
  async viewRoster(interaction, clanTag) {
    try {
      // Check if there's an active CWL season
      if (!this.activeSeasons.has(clanTag)) {
        return {
          success: false,
          message: 'There is no active CWL season.'
        };
      }
      
      // Generate roster embed
      const embed = await this.generateRosterEmbed(clanTag);
      
      return {
        success: true,
        embed
      };
    } catch (error) {
      log.error('Error viewing roster:', { error: error.message });
      return {
        success: false,
        message: 'An error occurred while viewing the roster.'
      };
    }
  }

  /**
   * Generate CWL roster embed
   * @param {String} clanTag - Clan tag
   */
  async generateRosterEmbed(clanTag) {
    try {
      // Get CWL season data
      const seasonData = this.activeSeasons.get(clanTag);
      if (!seasonData) {
        return new EmbedBuilder()
          .setTitle('No Active CWL Season')
          .setDescription('There is no active CWL season at the moment.')
          .setColor('#7289da');
      }
      
      const clan = await Clan.findOne({ clanTag });
      
      const embed = new EmbedBuilder()
        .setTitle(`${clan ? clan.name : 'Clan'} - CWL Roster (${seasonData.season})`)
        .setDescription(`League: ${seasonData.league} • Current Day: ${seasonData.currentDay}/7`)
        .setColor('#9b59b6');
        
      // Get player details for each roster member
      const rosterPlayers = [];
      
      for (const playerTag of seasonData.roster) {
        try {
          // Check if we have member performance data
          if (seasonData.memberPerformance.has(playerTag)) {
            const performance = seasonData.memberPerformance.get(playerTag);
            rosterPlayers.push({
              tag: playerTag,
              name: performance.name,
              townhallLevel: performance.townhallLevel,
              attacksUsed: performance.attacksUsed || 0,
              starsEarned: performance.starsEarned || 0
            });
          } else {
            // Fetch from API if not in performance data
            const playerData = await clashApiService.getPlayer(playerTag);
            rosterPlayers.push({
              tag: playerData.tag,
              name: playerData.name,
              townhallLevel: playerData.townHallLevel,
              attacksUsed: 0,
              starsEarned: 0
            });
          }
        } catch (error) {
          log.error(`Error fetching player data for ${playerTag}:`, { error: error.message });
          rosterPlayers.push({
            tag: playerTag,
            name: 'Unknown Player',
            townhallLevel: 0,
            attacksUsed: 0,
            starsEarned: 0
          });
        }
      }
      
      // Sort roster by TH level and then by name
      rosterPlayers.sort((a, b) => {
        if (b.townhallLevel !== a.townhallLevel) return b.townhallLevel - a.townhallLevel;
        return a.name.localeCompare(b.name);
      });
      
      // Format roster list
      if (rosterPlayers.length > 0) {
        let rosterList = '';
        rosterPlayers.forEach((player, index) => {
          const performanceText = seasonData.currentDay > 0 
            ? ` - ${player.starsEarned}⭐ in ${player.attacksUsed} attacks` 
            : '';
          
          rosterList += `${index + 1}. **${player.name}** - TH${player.townhallLevel}${performanceText}\n`;
        });
        
        embed.addFields({ 
          name: `Roster Members (${rosterPlayers.length})`, 
          value: rosterList || 'No players in roster'
        });
      } else {
        embed.addFields({ 
          name: 'Roster', 
          value: 'No players in roster yet. Add players using `/cwl roster add`.'
        });
      }
      
      // Add war results if available
      if (seasonData.currentDay > 0) {
        const cwlTracking = await CWLTracking.findOne({
          clanTag,
          isActive: true
        });
        
        if (cwlTracking && cwlTracking.warDays.length > 0) {
          let warResults = '';
          
          for (const warDay of cwlTracking.warDays.sort((a, b) => a.day - b.day)) {
            const resultEmoji = warDay.outcome === 'win' ? '🏆' : 
                              warDay.outcome === 'lose' ? '❌' : 
                              warDay.outcome === 'tie' ? '🤝' : '⏳';
            
            warResults += `Day ${warDay.day}: ${resultEmoji} vs ${warDay.opponent.name} - ${warDay.stars}⭐ to ${warDay.opponentStars}⭐\n`;
          }
          
          embed.addFields({ name: 'War Results', value: warResults });
        }
      }
      
      return embed;
    } catch (error) {
      log.error('Error generating roster embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading CWL Roster')
        .setDescription('An error occurred while loading the CWL roster. Please try again later.')
        .setColor('#e74c3c');
    }
  }

  /**
   * View CWL stats
   * @param {Interaction} interaction - Discord interaction
   * @param {String} clanTag - Clan tag
   */
  async viewCWLStats(interaction, clanTag) {
    try {
      // Get most recent CWL season
      const cwlTracking = await CWLTracking.findOne({
        clanTag
      }).sort({ createdAt: -1 });
      
      if (!cwlTracking) {
        return {
          success: false,
          message: 'No CWL history found for this clan.'
        };
      }
      
      // Generate stats embed
      const embed = await this.generateCWLStatsEmbed(cwlTracking);
      
      return {
        success: true,
        embed
      };
    } catch (error) {
      log.error('Error viewing CWL stats:', { error: error.message });
      return {
        success: false,
        message: 'An error occurred while viewing CWL stats.'
      };
    }
  }

  /**
   * Generate CWL stats embed
   * @param {Object} cwlTracking - CWL tracking document
   */
  async generateCWLStatsEmbed(cwlTracking) {
    try {
      const clan = await Clan.findOne({ clanTag: cwlTracking.clanTag });
      
      const embed = new EmbedBuilder()
        .setTitle(`${clan ? clan.name : 'Clan'} - CWL Stats (${cwlTracking.season})`)
        .setDescription(`League: ${cwlTracking.league}`)
        .setColor('#3498db');
        
      // Add season summary
      if (cwlTracking.finalPosition) {
        embed.addFields({
          name: 'Season Results',
          value: `Final Position: ${cwlTracking.finalPosition}/8\nWar Wins: ${cwlTracking.warWins}/7\nMedals Earned: ${cwlTracking.medalEarnings}`
        });
      }
      
      // Add war results
      if (cwlTracking.warDays && cwlTracking.warDays.length > 0) {
        let warResults = '';
        
        for (const warDay of cwlTracking.warDays.sort((a, b) => a.day - b.day)) {
          const resultEmoji = warDay.outcome === 'win' ? '🏆' : 
                            warDay.outcome === 'lose' ? '❌' : 
                            warDay.outcome === 'tie' ? '🤝' : '⏳';
          
          warResults += `Day ${warDay.day}: ${resultEmoji} vs ${warDay.opponent.name} - ${warDay.stars}⭐ to ${warDay.opponentStars}⭐\n`;
        }
        
        embed.addFields({ name: 'War Results', value: warResults });
      }
      
      // Add top performers
      if (cwlTracking.members && cwlTracking.members.length > 0) {
        // Sort by stars earned
        const topPerformers = [...cwlTracking.members]
          .filter(m => m.attacksUsed > 0)
          .sort((a, b) => b.starsEarned - a.starsEarned)
          .slice(0, 5);
          
        if (topPerformers.length > 0) {
          let performersText = '';
          topPerformers.forEach((member, index) => {
            const avgStars = member.attacksUsed > 0 ? (member.starsEarned / member.attacksUsed).toFixed(1) : '0.0';
            const avgDestruction = member.attacksUsed > 0 ? (member.totalDestruction / member.attacksUsed).toFixed(1) : '0.0';
            
            performersText += `${index + 1}. **${member.name}**: ${member.starsEarned}⭐ in ${member.attacksUsed} attacks (${avgStars} avg, ${avgDestruction}% avg)\n`;
          });
          
          embed.addFields({ name: 'Top Performers', value: performersText });
        }
      }
      
      return embed;
    } catch (error) {
      log.error('Error generating CWL stats embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading CWL Stats')
        .setDescription('An error occurred while loading the CWL stats. Please try again later.')
        .setColor('#e74c3c');
    }
  }
  
  // Notification methods would be implemented here, connecting to Discord channels
  // For brevity, these implementation details are omitted but would include:
  // - sendCWLSignupNotification
  // - sendCWLStartedNotification
  // - sendCWLDayStartedNotification
  // - sendCWLWarEndedNotification
  // - sendCWLEndedNotification
  
  /**
   * Send CWL signup notification
   * @param {Object} clan - Clan document
   */
  async sendCWLSignupNotification(clan) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'cwlAnnouncements');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 CWL Sign-up Period Has Started!')
        .setDescription(`The Clan War League sign-up period has begun! Leadership needs to register the clan within 48 hours.`)
        .setColor('#f1c40f')
        .addFields({
          name: 'Next Steps',
          value: 'Leadership should register for CWL in-game and then use `/cwl roster` commands to set up the roster for this season.'
        })
        .setFooter({ text: 'CWL sign-up usually lasts for about 48 hours' })
        .setTimestamp();
        
      await channel.send({ 
        content: '@everyone CWL sign-up period has started! Time to prepare for Clan War League!',
        embeds: [embed]
      });
      
      log.info(`Sent CWL signup notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending CWL signup notification:`, { error: error.message });
    }
  }
  
  /**
   * Send CWL started notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   */
  async sendCWLStartedNotification(clan, warData) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'cwlAnnouncements');
      if (!channel) return;
      
      // Get current season
      const seasonData = this.activeSeasons.get(clan.clanTag);
      const seasonName = seasonData ? seasonData.season : 'Current Season';
      const leagueName = warData?.warLeague?.name || (seasonData ? seasonData.league : 'Unknown League');
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 CWL Season Has Started!')
        .setDescription(`The ${seasonName} Clan War League has begun!`)
        .setColor('#e67e22')
        .addFields(
          { name: 'League', value: leagueName, inline: true },
          { name: 'Format', value: '7 War Days', inline: true }
        )
        .setFooter({ text: 'Use /cwl roster to manage your war roster' })
        .setTimestamp();
        
      await channel.send({ 
        content: '@everyone CWL has started! Prepare for 7 days of consecutive wars!',
        embeds: [embed]
      });
      
      log.info(`Sent CWL started notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending CWL started notification:`, { error: error.message });
    }
  }
  
  /**
   * Send CWL day started notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   * @param {Number} warDay - War day
   */
  async sendCWLDayStartedNotification(clan, warData, warDay) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'cwlAnnouncements');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle(`📅 CWL War Day ${warDay} Has Started!`)
        .setDescription(`War against **${warData.opponent.name}** has begun!`)
        .setColor('#3498db')
        .addFields(
          { name: 'War Size', value: `${warData.teamSize}v${warData.teamSize}`, inline: true }
        )
        .setFooter({ text: 'Remember, each player only gets ONE attack per war!' })
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
        content: `@everyone CWL Day ${warDay} has started! Time to attack!`,
        embeds: [embed]
      });
      
      log.info(`Sent CWL day ${warDay} started notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending CWL day started notification:`, { error: error.message });
    }
  }
  
  /**
   * Send CWL war ended notification
   * @param {Object} clan - Clan document
   * @param {Object} warData - War data
   * @param {Number} warDay - War day
   * @param {String} outcome - War outcome
   */
  async sendCWLWarEndedNotification(clan, warData, warDay, outcome) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'cwlAnnouncements');
      if (!channel) return;
      
      // Determine color and title based on result
      let color, title, description;
      switch (outcome) {
        case 'win':
          color = '#2ecc71'; // Green
          title = `🏆 CWL Day ${warDay} Victory!`;
          description = `We have defeated ${warData?.opponent?.name || 'our opponents'} in the Clan War League!`;
          break;
        case 'lose':
          color = '#e74c3c'; // Red
          title = `😔 CWL Day ${warDay} Defeat`;
          description = `We couldn't overcome ${warData?.opponent?.name || 'our opponents'} in this Clan War League battle.`;
          break;
        default: // Tie
          color = '#f39c12'; // Orange
          title = `🤝 CWL Day ${warDay} Tie!`;
          description = `Our battle with ${warData?.opponent?.name || 'our opponents'} ended in a perfect tie!`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .addFields(
          { name: `${warData.clan.name} Stars`, value: `⭐ ${warData.clan.stars || 0}`, inline: true },
          { name: `${warData.opponent.name} Stars`, value: `⭐ ${warData.opponent.stars || 0}`, inline: true },
          { name: `${warData.clan.name} Destruction`, value: `${warData.clan.destructionPercentage?.toFixed(2) || 0}%`, inline: true },
          { name: `${warData.opponent.name} Destruction`, value: `${warData.opponent.destructionPercentage?.toFixed(2) || 0}%`, inline: true }
        )
        .setTimestamp();
        
      // If we have the CWL tracking, show used attacks vs roster size
      const cwlTracking = await CWLTracking.findOne({
        clanTag: clan.clanTag,
        isActive: true
      });
      
      if (cwlTracking) {
        const dayIndex = cwlTracking.warDays.findIndex(day => day.day === warDay);
        if (dayIndex >= 0) {
          const attacksUsed = cwlTracking.warDays[dayIndex].attacksUsed;
          const rosterSize = cwlTracking.roster.length;
          
          embed.addFields({
            name: 'Attack Usage',
            value: `${attacksUsed}/${rosterSize} attacks used (${Math.round(attacksUsed/rosterSize*100)}%)`
          });
          
          // Add missed attacks list if any
          if (attacksUsed < rosterSize) {
            const missedAttacks = [];
            
            for (const playerTag of cwlTracking.roster) {
              const member = cwlTracking.members.find(m => m.playerTag === playerTag);
              if (member && !member.attacks.some(a => a.warDay === warDay)) {
                missedAttacks.push(member.name);
              }
            }
            
            if (missedAttacks.length > 0) {
              embed.addFields({
                name: 'Missed Attacks',
                value: missedAttacks.join(', ')
              });
            }
          }
        }
      }
      
      await channel.send({ 
        content: `CWL Day ${warDay} has ended with a ${outcome.toUpperCase()}!`,
        embeds: [embed]
      });
      
      log.info(`Sent CWL war ended notification for ${clan.name} with outcome: ${outcome}`);
    } catch (error) {
      log.error(`Error sending CWL war ended notification:`, { error: error.message });
    }
  }
  
  /**
   * Send CWL ended notification
   * @param {Object} clan - Clan document
   * @param {Object} cwlTracking - CWL tracking document
   */
  async sendCWLEndedNotification(clan, cwlTracking) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'cwlAnnouncements');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 CWL Season Has Ended!')
        .setDescription(`The ${cwlTracking.season} Clan War League is now complete!`)
        .setColor('#2ecc71')
        .addFields(
          { name: 'League', value: cwlTracking.league, inline: true },
          { name: 'Final Position', value: `${cwlTracking.finalPosition}/8`, inline: true },
          { name: 'Wars Won', value: `${cwlTracking.warWins}/7`, inline: true },
          { name: 'Medals Earned', value: cwlTracking.medalEarnings.toString(), inline: true }
        )
        .setFooter({ text: 'Use /cwl stats to view detailed performance' })
        .setTimestamp();
        
      // Add top performers
      if (cwlTracking.members && cwlTracking.members.length > 0) {
        // Sort by stars earned
        const topPerformers = [...cwlTracking.members]
          .filter(m => m.attacksUsed > 0)
          .sort((a, b) => b.starsEarned - a.starsEarned)
          .slice(0, 3);
          
        if (topPerformers.length > 0) {
          let performersText = '';
          topPerformers.forEach((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            const avgStars = (member.starsEarned / member.attacksUsed).toFixed(1);
            
            performersText += `${medal} **${member.name}**: ${member.starsEarned}⭐ in ${member.attacksUsed} attacks (${avgStars} avg)\n`;
          });
          
          embed.addFields({ name: 'Top Performers', value: performersText });
        }
      }
      
      // Add war results
      if (cwlTracking.warDays && cwlTracking.warDays.length > 0) {
        let resultsText = '';
        const days = [...cwlTracking.warDays].sort((a, b) => a.day - b.day);
        
        for (const day of days) {
          const resultEmoji = day.outcome === 'win' ? '🏆' : 
                            day.outcome === 'lose' ? '❌' : 
                            day.outcome === 'tie' ? '🤝' : '⏳';
          
          resultsText += `Day ${day.day}: ${resultEmoji} vs ${day.opponent.name} (${day.stars}-${day.opponentStars})\n`;
        }
        
        embed.addFields({ name: 'War Results', value: resultsText });
      }
      
      await channel.send({ 
        content: '@everyone CWL season has ended! Thanks for participating!',
        embeds: [embed]
      });
      
      log.info(`Sent CWL ended notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending CWL ended notification:`, { error: error.message });
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
        cwlAnnouncements: ['cwl-announcements', 'cwl-status', 'cwl'],
        cwlRoster: ['cwl-roster', 'roster', 'cwl-players'],
        cwlDailyMatchups: ['cwl-daily-matchups', 'cwl-matchups', 'daily-matchups']
      };
      
      const names = channelNames[type] || [];
      
      for (const name of names) {
        const channel = guild.channels.cache.find(c => c.name === name);
        if (channel) return channel;
      }
      
      // Fall back to general war announcements channel if no specific cwl channel
      if (type === 'cwlAnnouncements') {
        const warChannel = await this.findAppropriateChannel(clan, 'warAnnouncements');
        if (warChannel) return warChannel;
      }
      
      log.warn(`No appropriate channel found for ${type} in guild ${guild.id}`);
      return null;
    } catch (error) {
      log.error(`Error finding appropriate channel:`, { error: error.message });
      return null;
    }
  }
}

module.exports = new CwlTrackingService();
