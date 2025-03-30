// debug-roles-structure.js
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

        console.log('\nRole settings structure:');
        console.log(JSON.stringify(clan.settings.roles, null, 2));

        // Create a test update
        console.log('\nTesting townHall roles update...');
        const testTHRoles = {
            '10': { id: '123456789', emoji: '🔟' }
        };

        // Try direct field update
        const updateResult = await Clan.updateOne(
            { _id: clan._id },
            { $set: { 'settings.roles.townHall': testTHRoles } }
        );

        console.log('Update result:', updateResult);

        // Fetch again to see if update worked
        const updatedClan = await Clan.findOne({ _id: clan._id });
        console.log('\nTownHall roles after update:');
        console.log(JSON.stringify(updatedClan.settings.roles.townHall, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();