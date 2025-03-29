// fix-roles.js
require('dotenv').config();
const mongoose = require('mongoose');

// Connect to database
async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        // Get the Clan model (match the path to your actual file)
        const Clan = require('./src/models/Clan');

        // Find all clans in the database
        const clans = await Clan.find();
        console.log(`Found ${clans.length} clan(s) in database`);

        for (const clan of clans) {
            console.log('\nClan details:');
            console.log(`ID: ${clan._id}`);
            console.log(`Name: ${clan.name || 'Not set'}`);
            console.log(`Tag: ${clan.clanTag}`);
            console.log(`Guild ID: ${clan.guildId}`);

            // Check if settings and roles exist
            if (!clan.settings) {
                console.log('Settings object missing! Creating it...');
                clan.settings = {};
                await clan.save();
            }

            if (!clan.settings.roles) {
                console.log('Roles object missing! Creating it...');
                clan.settings.roles = {};
                await clan.save();
            }

            // Check what role configurations exist
            console.log('\nRole configurations:');
            console.log('Town Hall roles:', clan.settings.roles.townHall ? 'Present' : 'Missing');
            console.log('Clan roles:', clan.settings.roles.clanRole ? 'Present' : 'Missing');
            console.log('War activity roles:', clan.settings.roles.warActivity ? 'Present' : 'Missing');
            console.log('Donation tier roles:', clan.settings.roles.donationTier ? 'Present' : 'Missing');

            // If clan roles exist, show what's configured
            if (clan.settings.roles.clanRole) {
                console.log('\nConfigured clan roles:');
                console.log(JSON.stringify(clan.settings.roles.clanRole, null, 2));
            }

            // Ask if user wants to restore clan roles from earlier log
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                readline.question('\nDo you want to restore clan roles from logs? (y/n): ', resolve);
            });

            if (answer.toLowerCase() === 'y') {
                // Restore roles from the log output
                clan.settings.roles.clanRole = {
                    "leader": "1355584131526033620",
                    "coLeader": "1355584132830462163",
                    "elder": "1355584134063591445",
                    "member": "1355584135133008113"
                };

                console.log('Roles restored. Saving...');

                // Use save with explicit options to ensure it's saved
                await clan.save({ validateBeforeSave: false });

                // Verify the save by re-fetching
                const verifiedClan = await Clan.findById(clan._id);
                console.log('Verified saved roles:',
                    verifiedClan.settings?.roles?.clanRole ?
                        JSON.stringify(verifiedClan.settings.roles.clanRole) :
                        'Not found');
            }

            readline.close();
        }

        console.log('\nProcess complete!');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();