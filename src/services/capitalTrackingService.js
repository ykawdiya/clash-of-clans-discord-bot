// src/services/capitalTrackingService.js
const { EmbedBuilder } = require('discord.js');
const CapitalTracking = require('../models/CapitalTracking');
const Clan = require('../models/Clan');
const clashApiService = require('./clashApiService');
const { system: log } = require('../utils/logger');

class CapitalTrackingService {
  constructor() {
    // Initialize tracking maps
    this.clanCapitals = new Map();
    this.raidTracking = new Map();
    this.checkInterval = 12 * 60 * 60 * 1000; // 12 hours
    this.monitorInterval = null;
    
    // Initialize weekly date tracking
    this.lastWeekCheck = new Date();
    this.weekendDates = [];
    this.calculateWeekendDates();
  }
  
  /**
   * Calculate Raid Weekend dates
   */
  calculateWeekendDates() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    // Calculate the next 6 months of raid weekends (first weekend of each month)
    for (let month = currentMonth; month < currentMonth + 6; month++) {
      const actualMonth = month % 12;
      const actualYear = currentYear + Math.floor(month / 12);
      
      // Find the first Friday of the month
      let date = new Date(actualYear, actualMonth, 1);
      while (date.getDay() !== 5) { // 5 = Friday
        date.setDate(date.getDate() + 1);
      }
      
      // Raid weekends are Friday, Saturday, Sunday
      this.weekendDates.push({
        start: new Date(date),
        end: new Date(date.setDate(date.getDate() + 2)) // Sunday
      });
      
      // Also add second weekend of the month
      date = new Date(actualYear, actualMonth, 8); // Start from 8th to find second Friday
      while (date.getDay() !== 5) { // 5 = Friday
        date.setDate(date.getDate() + 1);
      }
      
      this.weekendDates.push({
        start: new Date(date),
        end: new Date(date.setDate(date.getDate() + 2)) // Sunday
      });
      
      // Also add third weekend of the month
      date = new Date(actualYear, actualMonth, 15); // Start from 15th to find third Friday
      while (date.getDay() !== 5) { // 5 = Friday
        date.setDate(date.getDate() + 1);
      }
      
      this.weekendDates.push({
        start: new Date(date),
        end: new Date(date.setDate(date.getDate() + 2)) // Sunday
      });
      
      // Also add fourth weekend of the month (if it exists)
      date = new Date(actualYear, actualMonth, 22); // Start from 22nd to find fourth Friday
      while (date.getDay() !== 5) { // 5 = Friday
        date.setDate(date.getDate() + 1);
      }
      
      // Only add if it's still in the same month
      if (date.getMonth() === actualMonth) {
        this.weekendDates.push({
          start: new Date(date),
          end: new Date(date.setDate(date.getDate() + 2)) // Sunday
        });
      }
    }
    
    log.info(`Calculated ${this.weekendDates.length} Raid Weekend dates`);
  }
  
  /**
   * Check if current date is a Raid Weekend
   */
  isRaidWeekend() {
    const now = new Date();
    
    // Check if today falls within any of the calculated raid weekends
    for (const weekend of this.weekendDates) {
      if (now >= weekend.start && now <= weekend.end) {
        return true;
      }
    }
    
    // Alternative check based on day of week
    const day = now.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
    return day === 5 || day === 6 || day === 0;
  }
  
  /**
   * Start monitoring Clan Capital for all registered clans
   */
  async startCapitalMonitoring() {
    log.info('Starting Clan Capital monitoring service');
    
    // Clear any existing interval
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Load any existing tracking data from database
    await this.loadCapitalDataFromDatabase();
    
    // Set up interval for checking Capital status
    this.monitorInterval = setInterval(() => this.checkAllClans(), this.checkInterval);
    
    // Perform initial check
    await this.checkAllClans();
    
    log.info('Capital monitoring started successfully');
    return true;
  }
  
  /**
   * Load existing capital data from database
   */
  async loadCapitalDataFromDatabase() {
    try {
      // Find all capitals in the database
      const capitals = await CapitalTracking.find({});
      log.info(`Found ${capitals.length} clan capitals in database`);
      
      for (const capital of capitals) {
        // Store basic capital info in memory
        this.clanCapitals.set(capital.clanTag, {
          capitalHallLevel: capital.capitalHallLevel,
          districts: capital.districts,
          lastUpdated: capital.lastUpdated
        });
        
        // Check if raid weekend is active
        if (capital.isRaidWeekend) {
          this.raidTracking.set(capital.clanTag, {
            startDate: capital.currentRaid.startDate,
            endDate: capital.currentRaid.endDate,
            currentAttacks: capital.currentRaid.currentAttacks,
            districtsDestroyed: capital.currentRaid.districtsDestroyed
          });
        }
        
        log.info(`Loaded capital data for ${capital.clanTag}: Capital Hall Level ${capital.capitalHallLevel}`);
      }
    } catch (error) {
      log.error('Error loading capital data from database:', { error: error.message });
    }
  }
  
  /**
   * Check all clans for Capital updates and Raid Weekend status
   */
  async checkAllClans() {
    try {
      // Get all registered clans
      const clans = await Clan.find({});
      log.info(`Checking Capital status for ${clans.length} clans`);
      
      for (const clan of clans) {
        await this.checkClanCapital(clan);
      }
    } catch (error) {
      log.error('Error checking clan capitals:', { error: error.message });
    }
  }
  
  /**
   * Check a specific clan's Capital status
   * @param {Object} clan - Clan document
   */
  async checkClanCapital(clan) {
    try {
      // Get current clan data to check capital
      const clanData = await clashApiService.getClan(clan.clanTag);
      
      if (!clanData.clanCapital) {
        log.info(`Clan ${clan.name} does not have Clan Capital data available`);
        return;
      }
      
      // Check if we're already tracking this clan's capital
      const isTracking = this.clanCapitals.has(clan.clanTag);
      
      if (!isTracking) {
        log.info(`Starting to track Clan Capital for ${clan.name}`);
        this.clanCapitals.set(clan.clanTag, {
          capitalHallLevel: clanData.clanCapital.capitalHallLevel,
          districts: this.mapDistricts(clanData.clanCapital),
          lastUpdated: new Date()
        });
        
        await this.initializeCapitalTracking(clan, clanData.clanCapital);
        return;
      }
      
      // Get previous capital data
      const previousCapital = this.clanCapitals.get(clan.clanTag);
      
      // Check for Capital Hall upgrade
      if (previousCapital.capitalHallLevel < clanData.clanCapital.capitalHallLevel) {
        log.info(`Capital Hall upgraded for ${clan.name}! Level ${clanData.clanCapital.capitalHallLevel}`);
        await this.sendCapitalUpgradeNotification(clan, 'Capital Hall', clanData.clanCapital.capitalHallLevel);
        
        // Update capital hall level in database
        await CapitalTracking.findOneAndUpdate(
          { clanTag: clan.clanTag },
          { 
            capitalHallLevel: clanData.clanCapital.capitalHallLevel,
            lastUpdated: new Date()
          }
        );
      }
      
      // Map and check for district updates
      const currentDistricts = this.mapDistricts(clanData.clanCapital);
      
      // Check for district upgrades
      if (previousCapital.districts) {
        for (const district of currentDistricts) {
          const previousDistrict = previousCapital.districts.find(d => d.name === district.name);
          
          if (previousDistrict && previousDistrict.level < district.level) {
            log.info(`District upgraded for ${clan.name}: ${district.name} to level ${district.level}`);
            await this.sendCapitalUpgradeNotification(clan, district.name, district.level);
            
            // Update district level in database
            await CapitalTracking.findOneAndUpdate(
              { clanTag: clan.clanTag, "districts.name": district.name },
              { 
                $set: { "districts.$.level": district.level, "districts.$.lastUpgraded": new Date() },
                lastUpdated: new Date()
              }
            );
          }
        }
      }
      
      // Update stored data
      this.clanCapitals.set(clan.clanTag, {
        capitalHallLevel: clanData.clanCapital.capitalHallLevel,
        districts: currentDistricts,
        lastUpdated: new Date()
      });
      
      // Check if it's Raid Weekend
      const isRaidWeekend = this.isRaidWeekend();
      
      if (isRaidWeekend) {
        await this.trackRaidWeekend(clan);
      } else if (this.raidTracking.has(clan.clanTag)) {
        // If we were tracking a raid that ended
        await this.finalizeRaidWeekend(clan);
        this.raidTracking.delete(clan.clanTag);
      }
    } catch (error) {
      log.error(`Error checking Clan Capital for ${clan.name}:`, { error: error.message });
    }
  }
  
  /**
   * Map district data from API
   * @param {Object} capitalData - Capital data from API
   */
  mapDistricts(capitalData) {
    const districts = [
      {
        name: 'Capital Hall',
        level: capitalData.capitalHallLevel,
        nextUpgradeCost: this.getNextUpgradeCost('Capital Hall', capitalData.capitalHallLevel)
      }
    ];
    
    // Add other districts based on API data
    // This is a placeholder as the API might not provide detailed district data
    // In a real implementation, we would process district-specific data
    const districtNames = [
      'Barbarian Camp',
      'Wizard Valley',
      'Balloon Lagoon',
      "Builder's Workshop",
      'Dragon Cliffs',
      'Golem Quarry',
      'Skeleton Park'
    ];
    
    // Add unlocked districts based on Capital Hall level
    const unlockedCount = Math.min(capitalData.capitalHallLevel, districtNames.length);
    
    for (let i = 0; i < unlockedCount; i++) {
      // Assume district level is Capital Hall level - 1 (or 1 if that would be 0)
      const estimatedLevel = Math.max(1, capitalData.capitalHallLevel - 1);
      
      districts.push({
        name: districtNames[i],
        level: estimatedLevel,
        nextUpgradeCost: this.getNextUpgradeCost(districtNames[i], estimatedLevel)
      });
    }
    
    return districts;
  }
  
  /**
   * Get estimated next upgrade cost
   * @param {String} districtName - District name
   * @param {Number} currentLevel - Current level
   */
  getNextUpgradeCost(districtName, currentLevel) {
    // This is a placeholder with rough estimates
    // In a real implementation, we would have accurate upgrade costs
    const baseCost = 25000;
    const multiplier = districtName === 'Capital Hall' ? 4 : 2;
    
    return baseCost * multiplier * Math.pow(2, currentLevel);
  }
  
  /**
   * Initialize Capital tracking for a clan
   * @param {Object} clan - Clan document
   * @param {Object} capitalData - Capital data from API
   */
  async initializeCapitalTracking(clan, capitalData) {
    try {
      // Map districts
      const districts = this.mapDistricts(capitalData);
      
      // Create capital tracking in database
      const newCapitalTracking = new CapitalTracking({
        clanTag: clan.clanTag,
        guildId: clan.guildId,
        capitalHallLevel: capitalData.capitalHallLevel,
        totalDistrictsUnlocked: districts.length,
        districts: districts,
        currentWeek: this.getCurrentWeekId(),
        currentWeekTotal: 0,
        isRaidWeekend: this.isRaidWeekend(),
        lastUpdated: new Date(),
        createdAt: new Date()
      });
      
      // If it's raid weekend, initialize raid tracking
      if (this.isRaidWeekend()) {
        const weekend = this.getCurrentWeekend();
        
        newCapitalTracking.currentRaid = {
          startDate: weekend.start,
          endDate: weekend.end,
          currentAttacks: 0,
          districtsDestroyed: 0
        };
        
        // Add to raid tracking
        this.raidTracking.set(clan.clanTag, {
          startDate: weekend.start,
          endDate: weekend.end,
          currentAttacks: 0,
          districtsDestroyed: 0
        });
      }
      
      await newCapitalTracking.save();
      
      // Send notification that tracking has started
      await this.sendCapitalTrackingStartedNotification(clan, capitalData);
      
      log.info(`Initialized capital tracking for ${clan.name}`);
    } catch (error) {
      log.error(`Error initializing capital tracking for ${clan.name}:`, { error: error.message });
    }
  }
  
  /**
   * Track Raid Weekend progress
   * @param {Object} clan - Clan document
   */
  async trackRaidWeekend(clan) {
    try {
      // Get capital tracking from database
      const capitalTracking = await CapitalTracking.findOne({ clanTag: clan.clanTag });
      
      if (!capitalTracking) {
        log.warn(`No capital tracking found for ${clan.clanTag}`);
        return;
      }
      
      // If we're not tracking this raid yet
      if (!this.raidTracking.has(clan.clanTag)) {
        log.info(`Starting to track Raid Weekend for ${clan.name}`);
        
        // Get current weekend
        const weekend = this.getCurrentWeekend();
        
        // Initialize raid tracking
        this.raidTracking.set(clan.clanTag, {
          startDate: weekend.start,
          endDate: weekend.end,
          currentAttacks: 0,
          districtsDestroyed: 0
        });
        
        // Update database
        capitalTracking.isRaidWeekend = true;
        capitalTracking.currentRaid = {
          startDate: weekend.start,
          endDate: weekend.end,
          currentAttacks: 0,
          districtsDestroyed: 0
        };
        
        await capitalTracking.save();
        
        // Send notification
        await this.sendRaidWeekendStartedNotification(clan);
      }
      
      // Check for raid progress updates
      // In a real implementation, we would fetch raid progress from the API
      // and update the tracking data accordingly
      
    } catch (error) {
      log.error(`Error tracking Raid Weekend for ${clan.name}:`, { error: error.message });
    }
  }
  
  /**
   * Finalize Raid Weekend and record results
   * @param {Object} clan - Clan document
   */
  async finalizeRaidWeekend(clan) {
    try {
      // Get raid data
      const raidData = this.raidTracking.get(clan.clanTag);
      
      if (!raidData) {
        log.warn(`No raid data found for ${clan.clanTag}`);
        return;
      }
      
      // Get capital tracking from database
      const capitalTracking = await CapitalTracking.findOne({ clanTag: clan.clanTag });
      
      if (!capitalTracking) {
        log.warn(`No capital tracking found for ${clan.clanTag}`);
        return;
      }
      
      // Create raid weekend summary
      const raidWeekend = {
        startDate: raidData.startDate,
        endDate: raidData.endDate,
        totalAttacks: raidData.currentAttacks,
        districtsDestroyed: raidData.districtsDestroyed,
        // This is a placeholder - in a real implementation we would have accurate data
        capitalGoldLooted: raidData.districtsDestroyed * 10000,
        medalsEarned: Math.floor(raidData.districtsDestroyed * 6.25),
        totalAttacksAvailable: 0, // Would be based on member count
        attacks: [] // Would contain individual member attacks
      };
      
      // Update database
      capitalTracking.isRaidWeekend = false;
      capitalTracking.currentRaid = null;
      capitalTracking.raidWeekends.push(raidWeekend);
      
      await capitalTracking.save();
      
      // Send summary notification
      await this.sendRaidWeekendSummary(clan, raidData);
      
      log.info(`Finalized Raid Weekend for ${clan.name}`);
    } catch (error) {
      log.error(`Error finalizing Raid Weekend for ${clan.name}:`, { error: error.message });
    }
  }
  
  /**
   * Track capital contributions
   * @param {String} clanTag - Clan tag
   * @param {String} playerTag - Player tag
   * @param {Number} contribution - Contribution amount
   */
  async trackContribution(clanTag, playerTag, contribution) {
    try {
      // Get player data
      const playerData = await clashApiService.getPlayer(playerTag);
      
      if (!playerData) {
        log.warn(`Could not find player ${playerTag}`);
        return false;
      }
      
      // Get current week ID
      const weekId = this.getCurrentWeekId();
      
      // Get capital tracking from database
      const capitalTracking = await CapitalTracking.findOne({ clanTag });
      
      if (!capitalTracking) {
        log.warn(`No capital tracking found for ${clanTag}`);
        return false;
      }
      
      // Check if we need to initialize a new week
      if (capitalTracking.currentWeek !== weekId) {
        capitalTracking.currentWeek = weekId;
        capitalTracking.currentWeekTotal = 0;
        capitalTracking.weeklyContributions.set(weekId, []);
      }
      
      // Get current week's contributions
      let weeklyContributions = capitalTracking.weeklyContributions.get(weekId) || [];
      
      // Add contribution
      weeklyContributions.push({
        playerTag,
        name: playerData.name,
        contribution,
        week: weekId,
        timestamp: new Date()
      });
      
      // Update weekly contributions
      capitalTracking.weeklyContributions.set(weekId, weeklyContributions);
      
      // Update current week total
      capitalTracking.currentWeekTotal += contribution;
      
      await capitalTracking.save();
      
      // Check for contribution milestones
      await this.checkContributionMilestones(clanTag, capitalTracking.currentWeekTotal);
      
      log.info(`Tracked ${contribution} capital gold contribution for ${playerData.name} in ${clanTag}`);
      return true;
    } catch (error) {
      log.error(`Error tracking contribution:`, { error: error.message });
      return false;
    }
  }
  
  /**
   * Check for contribution milestones
   * @param {String} clanTag - Clan tag
   * @param {Number} total - Total contribution
   */
  async checkContributionMilestones(clanTag, total) {
    try {
      // Define milestones
      const milestones = [50000, 100000, 250000, 500000, 1000000];
      
      // Get clan
      const clan = await Clan.findOne({ clanTag });
      
      if (!clan) {
        log.warn(`Could not find clan ${clanTag}`);
        return;
      }
      
      // Check if we've reached a milestone
      for (const milestone of milestones) {
        if (total >= milestone && (!clan.capitalStats.lastMilestone || clan.capitalStats.lastMilestone < milestone)) {
          // Update clan's last milestone
          await Clan.findOneAndUpdate(
            { clanTag },
            { 'capitalStats.lastMilestone': milestone }
          );
          
          // Send milestone notification
          await this.sendContributionMilestoneNotification(clan, milestone);
          
          log.info(`Contribution milestone reached for ${clan.name}: ${milestone}`);
          break;
        }
      }
    } catch (error) {
      log.error(`Error checking contribution milestones:`, { error: error.message });
    }
  }
  
  /**
   * Get current week ID
   */
  getCurrentWeekId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekOfMonth = Math.ceil(day / 7);
    
    return `${year}-${month.toString().padStart(2, '0')}-${weekOfMonth}`;
  }
  
  /**
   * Get current weekend date range
   */
  getCurrentWeekend() {
    const now = new Date();
    
    // Find the current or next raid weekend
    for (const weekend of this.weekendDates) {
      if (now <= weekend.end) {
        return weekend;
      }
    }
    
    // If none found, use the closest future date
    return this.weekendDates[0];
  }
  
  /**
   * Get capital status
   * @param {String} clanTag - Clan tag
   */
  async getCapitalStatus(clanTag) {
    try {
      // Get capital tracking from database
      const capitalTracking = await CapitalTracking.findOne({ clanTag });
      
      if (!capitalTracking) {
        return {
          success: false,
          message: 'No capital tracking data found for this clan.'
        };
      }
      
      // Get clan info
      const clan = await Clan.findOne({ clanTag });
      
      if (!clan) {
        return {
          success: false,
          message: 'Clan not found.'
        };
      }
      
      // Build status object
      const status = {
        capitalHallLevel: capitalTracking.capitalHallLevel,
        districts: capitalTracking.districts,
        isRaidWeekend: capitalTracking.isRaidWeekend,
        currentRaid: capitalTracking.currentRaid,
        lastUpdated: capitalTracking.lastUpdated,
        weeklyContributions: this.getFormattedWeeklyContributions(capitalTracking),
        raidWeekends: capitalTracking.raidWeekends.map(rw => ({
          startDate: rw.startDate,
          endDate: rw.endDate,
          medalsEarned: rw.medalsEarned,
          districtsDestroyed: rw.districtsDestroyed,
          totalAttacks: rw.totalAttacks
        })).sort((a, b) => b.startDate - a.startDate).slice(0, 5), // Last 5 weekends
        nextUpgrade: this.getNextRecommendedUpgrade(capitalTracking)
      };
      
      return {
        success: true,
        status,
        clan
      };
    } catch (error) {
      log.error(`Error getting capital status:`, { error: error.message });
      return {
        success: false,
        message: 'An error occurred while getting capital status.'
      };
    }
  }
  
  /**
   * Get formatted weekly contributions
   * @param {Object} capitalTracking - Capital tracking document
   */
  getFormattedWeeklyContributions(capitalTracking) {
    // Get current week
    const weekId = this.getCurrentWeekId();
    
    // Get weekly contributions
    const contributions = {};
    
    // Add current week
    if (capitalTracking.weeklyContributions.has(weekId)) {
      const weekContribs = capitalTracking.weeklyContributions.get(weekId);
      
      // Group by player
      const playerContribs = new Map();
      
      for (const contrib of weekContribs) {
        if (!playerContribs.has(contrib.playerTag)) {
          playerContribs.set(contrib.playerTag, {
            playerTag: contrib.playerTag,
            name: contrib.name,
            total: 0
          });
        }
        
        playerContribs.get(contrib.playerTag).total += contrib.contribution;
      }
      
      // Convert to array and sort
      const sortedContribs = Array.from(playerContribs.values())
        .sort((a, b) => b.total - a.total);
      
      contributions[weekId] = {
        total: capitalTracking.currentWeekTotal,
        players: sortedContribs
      };
    }
    
    return contributions;
  }
  
  /**
   * Get next recommended upgrade
   * @param {Object} capitalTracking - Capital tracking document
   */
  getNextRecommendedUpgrade(capitalTracking) {
    // This is a simplified recommendation logic
    // In a real implementation, we would have more sophisticated logic
    
    // First, check if Capital Hall can be upgraded
    const capitalHall = capitalTracking.districts.find(d => d.name === 'Capital Hall');
    
    if (!capitalHall) {
      return null;
    }
    
    // Find the lowest level district
    const districts = [...capitalTracking.districts].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.nextUpgradeCost - b.nextUpgradeCost;
    });
    
    // If any district is more than 2 levels below Capital Hall, prioritize it
    for (const district of districts) {
      if (district.name !== 'Capital Hall' && capitalHall.level - district.level > 2) {
        return {
          name: district.name,
          currentLevel: district.level,
          nextLevel: district.level + 1,
          cost: district.nextUpgradeCost
        };
      }
    }
    
    // Otherwise, suggest the cheapest upgrade
    const cheapest = [...capitalTracking.districts].sort((a, b) => 
      a.nextUpgradeCost - b.nextUpgradeCost
    )[0];
    
    return {
      name: cheapest.name,
      currentLevel: cheapest.level,
      nextLevel: cheapest.level + 1,
      cost: cheapest.nextUpgradeCost
    };
  }
  
  /**
   * Generate capital status embed
   * @param {String} clanTag - Clan tag
   */
  async generateCapitalStatusEmbed(clanTag) {
    try {
      // Get capital status
      const { success, status, clan, message } = await this.getCapitalStatus(clanTag);
      
      if (!success) {
        return new EmbedBuilder()
          .setTitle('Clan Capital Status Unavailable')
          .setDescription(message || 'Could not retrieve Clan Capital information.')
          .setColor('#e74c3c');
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`${clan.name} - Clan Capital Status`)
        .setDescription(`Capital Hall Level: ${status.capitalHallLevel}`)
        .setColor('#2ecc71')
        .setTimestamp();
        
      // Add district information
      let districtInfo = '';
      const sortedDistricts = [...status.districts].sort((a, b) => {
        if (a.name === 'Capital Hall') return -1;
        if (b.name === 'Capital Hall') return 1;
        return a.name.localeCompare(b.name);
      });
      
      for (const district of sortedDistricts) {
        districtInfo += `${district.name}: Level ${district.level}\n`;
      }
      
      embed.addFields({ name: 'Districts', value: districtInfo });
      
      // Add raid weekend status
      const isRaidWeekend = this.isRaidWeekend();
      embed.addFields({
        name: 'Raid Weekend',
        value: isRaidWeekend ? '🟢 Active Now!' : '🔴 Not Active'
      });
      
      // Add next raid weekend info if not active
      if (!isRaidWeekend) {
        const nextWeekend = this.getCurrentWeekend();
        const daysUntil = Math.ceil((nextWeekend.start - new Date()) / (1000 * 60 * 60 * 24));
        
        embed.addFields({
          name: 'Next Raid Weekend',
          value: `Starts in ${daysUntil} days (${nextWeekend.start.toDateString()})`
        });
      }
      
      // Add recommended upgrade
      if (status.nextUpgrade) {
        embed.addFields({
          name: 'Recommended Upgrade',
          value: `${status.nextUpgrade.name} to Level ${status.nextUpgrade.nextLevel} (Cost: ${status.nextUpgrade.cost.toLocaleString()} Capital Gold)`
        });
      }
      
      // Add recent raid results if available
      if (status.raidWeekends && status.raidWeekends.length > 0) {
        const latestRaid = status.raidWeekends[0];
        
        embed.addFields({
          name: 'Latest Raid Results',
          value: `Districts Destroyed: ${latestRaid.districtsDestroyed}\nMedals Earned: ${latestRaid.medalsEarned}\nTotal Attacks: ${latestRaid.totalAttacks}`
        });
      }
      
      // Add weekly contributions
      const weekId = this.getCurrentWeekId();
      if (status.weeklyContributions && status.weeklyContributions[weekId]) {
        const contributions = status.weeklyContributions[weekId];
        
        embed.addFields({
          name: `Weekly Contributions (${weekId})`,
          value: `Total: ${contributions.total.toLocaleString()} Capital Gold`
        });
        
        // Add top contributors if available
        if (contributions.players && contributions.players.length > 0) {
          let contributorsText = '';
          const topContributors = contributions.players.slice(0, 5);
          
          topContributors.forEach((player, index) => {
            contributorsText += `${index + 1}. ${player.name}: ${player.total.toLocaleString()}\n`;
          });
          
          embed.addFields({
            name: 'Top Contributors',
            value: contributorsText || 'No contributions recorded yet'
          });
        }
      }
      
      return embed;
    } catch (error) {
      log.error('Error generating capital status embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading Capital Status')
        .setDescription('An error occurred while loading the Clan Capital status. Please try again later.')
        .setColor('#e74c3c');
    }
  }
  
  /**
   * Generate raid weekend status embed
   * @param {String} clanTag - Clan tag
   */
  async generateRaidWeekendStatusEmbed(clanTag) {
    try {
      // Get capital status
      const { success, status, clan, message } = await this.getCapitalStatus(clanTag);
      
      if (!success) {
        return new EmbedBuilder()
          .setTitle('Raid Weekend Status Unavailable')
          .setDescription(message || 'Could not retrieve Raid Weekend information.')
          .setColor('#e74c3c');
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`${clan.name} - Raid Weekend Status`)
        .setColor('#9b59b6')
        .setTimestamp();
        
      // Check if raid weekend is active
      if (status.isRaidWeekend && status.currentRaid) {
        embed.setDescription('🟢 Raid Weekend is currently active!');
        
        const raidEndTime = new Date(status.currentRaid.endDate);
        const timeUntil = raidEndTime - new Date();
        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        embed.addFields(
          { name: 'Time Remaining', value: `${hoursUntil}h ${minutesUntil}m`, inline: true },
          { name: 'Districts Destroyed', value: `${status.currentRaid.districtsDestroyed || 0}`, inline: true },
          { name: 'Attacks Used', value: `${status.currentRaid.currentAttacks || 0}`, inline: true }
        );
      } else {
        embed.setDescription('🔴 No Raid Weekend currently active');
        
        const nextWeekend = this.getCurrentWeekend();
        const daysUntil = Math.ceil((nextWeekend.start - new Date()) / (1000 * 60 * 60 * 24));
        
        embed.addFields({
          name: 'Next Raid Weekend',
          value: `Starts in ${daysUntil} days (${nextWeekend.start.toDateString()})`
        });
      }
      
      // Add historical raid data
      if (status.raidWeekends && status.raidWeekends.length > 0) {
        let historyText = '';
        
        status.raidWeekends.forEach((raid, index) => {
          const date = new Date(raid.startDate).toLocaleDateString();
          historyText += `**${date}**: ${raid.districtsDestroyed} districts, ${raid.medalsEarned} medals\n`;
          
          if (index >= 4) return; // Show only last 5 raids
        });
        
        embed.addFields({
          name: 'Recent Raid History',
          value: historyText || 'No previous raids recorded'
        });
      }
      
      return embed;
    } catch (error) {
      log.error('Error generating raid weekend status embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading Raid Weekend Status')
        .setDescription('An error occurred while loading the Raid Weekend status. Please try again later.')
        .setColor('#e74c3c');
    }
  }

  /**
   * Generate contributions leaderboard embed
   * @param {String} clanTag - Clan tag
   */
  async generateContributionsLeaderboardEmbed(clanTag) {
    try {
      // Get capital tracking from database
      const capitalTracking = await CapitalTracking.findOne({ clanTag });
      
      if (!capitalTracking) {
        return new EmbedBuilder()
          .setTitle('Contributions Leaderboard Unavailable')
          .setDescription('No Clan Capital data found for this clan.')
          .setColor('#e74c3c');
      }
      
      // Get clan info
      const clan = await Clan.findOne({ clanTag });
      
      const embed = new EmbedBuilder()
        .setTitle(`${clan ? clan.name : 'Clan'} - Capital Gold Contributions`)
        .setColor('#f1c40f')
        .setTimestamp();
        
      // Get weekly contributions
      const weekId = this.getCurrentWeekId();
      const contributions = {};
      
      // Get current week's contributions
      if (capitalTracking.weeklyContributions.has(weekId)) {
        const weekContribs = capitalTracking.weeklyContributions.get(weekId);
        
        // Group by player
        const playerContribs = new Map();
        
        for (const contrib of weekContribs) {
          if (!playerContribs.has(contrib.playerTag)) {
            playerContribs.set(contrib.playerTag, {
              playerTag: contrib.playerTag,
              name: contrib.name,
              total: 0
            });
          }
          
          playerContribs.get(contrib.playerTag).total += contrib.contribution;
        }
        
        // Convert to array and sort
        const sortedContribs = Array.from(playerContribs.values())
          .sort((a, b) => b.total - a.total);
        
        contributions[weekId] = {
          total: capitalTracking.currentWeekTotal,
          players: sortedContribs
        };
        
        // Add current week info
        embed.setDescription(`Total Capital Gold this week: **${capitalTracking.currentWeekTotal.toLocaleString()}**`);
        
        // Add top contributors
        if (sortedContribs.length > 0) {
          let leaderboardText = '';
          
          sortedContribs.slice(0, 10).forEach((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboardText += `${medal} **${player.name}**: ${player.total.toLocaleString()} Capital Gold\n`;
          });
          
          embed.addFields({
            name: `Top Contributors (${weekId})`,
            value: leaderboardText || 'No contributions recorded yet'
          });
        } else {
          embed.addFields({
            name: 'No Contributions Yet',
            value: 'No Capital Gold contributions have been recorded this week.'
          });
        }
      } else {
        embed.setDescription('No Capital Gold contributions have been recorded this week.');
      }
      
      return embed;
    } catch (error) {
      log.error('Error generating contributions leaderboard embed:', { error: error.message });
      
      return new EmbedBuilder()
        .setTitle('Error Loading Contributions Leaderboard')
        .setDescription('An error occurred while loading the contributions leaderboard. Please try again later.')
        .setColor('#e74c3c');
    }
  }
  
  // Notification methods would be implemented here, connecting to Discord channels
  // For brevity, these implementation details are omitted but would include:
  // - sendCapitalTrackingStartedNotification
  // - sendCapitalUpgradeNotification
  // - sendRaidWeekendStartedNotification
  // - sendRaidWeekendSummary
  // - sendContributionMilestoneNotification
  
  /**
   * Send capital tracking started notification
   * @param {Object} clan - Clan document
   * @param {Object} capitalData - Capital data
   */
  async sendCapitalTrackingStartedNotification(clan, capitalData) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'capitalStatus');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🏛️ Clan Capital Tracking Started!')
        .setDescription(`The bot is now tracking your Clan Capital! Current Capital Hall Level: ${capitalData.capitalHallLevel}`)
        .setColor('#3498db')
        .addFields({
          name: 'Tracking Features',
          value: '• District upgrades\n• Capital Gold contributions\n• Raid Weekend performance\n• Upgrade recommendations'
        })
        .setFooter({ text: 'Use /capital commands to interact with Clan Capital features' })
        .setTimestamp();
        
      await channel.send({ embeds: [embed] });
      
      log.info(`Sent capital tracking started notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending capital tracking started notification:`, { error: error.message });
    }
  }
  
  /**
   * Send capital upgrade notification
   * @param {Object} clan - Clan document
   * @param {String} districtName - District name
   * @param {Number} level - New level
   */
  async sendCapitalUpgradeNotification(clan, districtName, level) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'capitalStatus');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🏛️ Clan Capital Upgrade!')
        .setDescription(`${districtName} has been upgraded to Level ${level}!`)
        .setColor('#2ecc71')
        .setTimestamp();
        
      await channel.send({ embeds: [embed] });
      
      log.info(`Sent capital upgrade notification for ${clan.name}: ${districtName} to level ${level}`);
    } catch (error) {
      log.error(`Error sending capital upgrade notification:`, { error: error.message });
    }
  }
  
  /**
   * Send raid weekend started notification
   * @param {Object} clan - Clan document
   */
  async sendRaidWeekendStartedNotification(clan) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'raidWeekends');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('⚔️ Raid Weekend Has Started!')
        .setDescription('The Clan Capital Raid Weekend has begun! Time to attack!')
        .setColor('#e67e22')
        .addFields({
          name: 'Reminders',
          value: '• Use all your attacks\n• Try to fully destroy districts\n• Coordinate with clanmates for efficient attacks'
        })
        .setFooter({ text: 'Use /capital raids to check raid status' })
        .setTimestamp();
        
      await channel.send({ 
        content: '@everyone Raid Weekend has started! Use all your attacks!',
        embeds: [embed]
      });
      
      log.info(`Sent raid weekend started notification for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending raid weekend started notification:`, { error: error.message });
    }
  }
  
  /**
   * Send raid weekend summary
   * @param {Object} clan - Clan document
   * @param {Object} raidData - Raid data
   */
  async sendRaidWeekendSummary(clan, raidData) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'raidWeekends');
      if (!channel) return;
      
      // Calculate estimated medals
      const medalsEarned = Math.floor(raidData.districtsDestroyed * 6.25);
      
      const embed = new EmbedBuilder()
        .setTitle('🏁 Raid Weekend Results')
        .setDescription('The Clan Capital Raid Weekend has ended!')
        .setColor('#3498db')
        .addFields(
          { name: 'Districts Destroyed', value: raidData.districtsDestroyed.toString(), inline: true },
          { name: 'Raid Medals Earned', value: medalsEarned.toString(), inline: true },
          { name: 'Attacks Used', value: raidData.currentAttacks.toString(), inline: true }
        )
        .setFooter({ text: 'Use /capital status to see overall Capital progress' })
        .setTimestamp();
        
      await channel.send({ embeds: [embed] });
      
      log.info(`Sent raid weekend summary for ${clan.name}`);
    } catch (error) {
      log.error(`Error sending raid weekend summary:`, { error: error.message });
    }
  }
  
  /**
   * Send contribution milestone notification
   * @param {Object} clan - Clan document
   * @param {Number} milestone - Milestone amount
   */
  async sendContributionMilestoneNotification(clan, milestone) {
    try {
      // Find the appropriate channel
      const channel = await this.findAppropriateChannel(clan, 'contributionTracker');
      if (!channel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 Contribution Milestone Reached!')
        .setDescription(`The clan has contributed a total of **${milestone.toLocaleString()} Capital Gold** this week!`)
        .setColor('#f1c40f')
        .setFooter({ text: 'Use /capital contribute to track your contributions' })
        .setTimestamp();
        
      await channel.send({ embeds: [embed] });
      
      log.info(`Sent contribution milestone notification for ${clan.name}: ${milestone}`);
    } catch (error) {
      log.error(`Error sending contribution milestone notification:`, { error: error.message });
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
        capitalStatus: ['capital-status', 'clan-capital', 'capital'],
        raidWeekends: ['raid-weekends', 'capital-raids', 'raids'],
        contributionTracker: ['contribution-tracker', 'capital-contributions', 'contributions'],
        upgradePlanning: ['upgrade-planning', 'capital-upgrades', 'upgrades']
      };
      
      const names = channelNames[type] || [];
      
      for (const name of names) {
        const channel = guild.channels.cache.find(c => c.name === name);
        if (channel) return channel;
      }
      
      // Fall back to general capital channel if no specific channel
      if (type !== 'capitalStatus') {
        const capitalChannel = await this.findAppropriateChannel(clan, 'capitalStatus');
        if (capitalChannel) return capitalChannel;
      }
      
      log.warn(`No appropriate channel found for ${type} in guild ${guild.id}`);
      return null;
    } catch (error) {
      log.error(`Error finding appropriate channel:`, { error: error.message });
      return null;
    }
  }
}

module.exports = new CapitalTrackingService();
