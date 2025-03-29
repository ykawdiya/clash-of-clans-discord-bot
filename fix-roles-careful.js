// fix-roles-careful.js
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

        console.log('\nCurrent settings structure:');
        console.log(JSON.stringify(clan.settings, null, 2));

        // Instead of restructuring everything, let's use the Mongoose update method
        console.log('\nAdding role type fields with direct update...');

        // Use updateOne to safely add the new fields without disturbing existing structure
        const result = await Clan.updateOne(
            { _id: clan._id },
            {
                $set: {
                    'settings.roles.townHallRoles': {},
                    'settings.roles.warActivityRoles': {},
                    'settings.roles.donationTierRoles': {}
                }
            }
        );

        console.log('Update result:', result);

        // Verify the update worked
        const updatedClan = await Clan.findOne({ _id: clan._id });
        console.log('\nUpdated settings structure:');
        console.log(JSON.stringify(updatedClan.settings, null, 2));

        console.log('\nUpdate complete!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();