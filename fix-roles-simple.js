// fix-roles-simple.js
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

        // Update the role IDs directly in the current structure
        console.log('\nUpdating roles directly...');

        // Ensure settings and roles exist
        if (!clan.settings) clan.settings = {};
        if (!clan.settings.roles) clan.settings.roles = {};

        // Set the role IDs
        clan.settings.roles.leader = "1355584131526033620";
        clan.settings.roles.coLeader = "1355584132830462163";
        clan.settings.roles.elder = "1355584134063591445";
        clan.settings.roles.everyone = "1355584135133008113"; // Using "everyone" instead of "member" to match your schema

        // Save the changes
        await clan.save();
        console.log('Roles updated successfully!');

        // Verify the save
        const updatedClan = await Clan.findOne({ _id: clan._id });
        console.log('\nVerified roles after update:');
        console.log(JSON.stringify(updatedClan.settings.roles, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();