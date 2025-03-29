// fix-roles-all.js
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        // Get the Clan model
        const Clan = require('./src/models/Clan');

        // Find the clan
        const clan = await Clan.findOne();
        if (!clan) {
            console.log('No clan found in database!');
            return;
        }

        console.log('\nClan details:');
        console.log(`ID: ${clan._id}`);
        console.log(`Name: ${clan.name || 'Not set'}`);
        console.log(`Tag: ${clan.clanTag}`);

        // Ensure settings exists
        if (!clan.settings) clan.settings = {};

        // Update the schema structure to accommodate all role types
        console.log('\nUpdating database schema for all role types...');

        // Create a proper structure for all role types
        const newSettings = {
            ...clan.settings,
            roles: {
                ...clan.settings.roles, // Keep existing role settings
                // Add properties for other role types if they don't exist
                townHallRoles: clan.settings.roles?.townHall || {},
                warActivityRoles: clan.settings.roles?.warActivity || {},
                donationTierRoles: clan.settings.roles?.donationTier || {}
            }
        };

        // Update the clan with the new settings structure
        clan.settings = newSettings;
        await clan.save();

        console.log('Schema updated successfully!');
        console.log('\nVerified settings after update:');
        console.log(JSON.stringify(clan.settings, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();