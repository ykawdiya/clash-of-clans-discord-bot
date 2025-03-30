// fix-roles-direct.js
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

        console.log('\nSaving TH roles directly...');

        // Define TH roles (use your existing Discord role IDs)
        const thRoles = {
            '7': { id: '1355051670249406516', emoji: '7️⃣' },
            '8': { id: '1355051673202069658', emoji: '8️⃣' },
            '9': { id: '1355051675911721045', emoji: '9️⃣' },
            '10': { id: '1355051679174754447', emoji: '🔟' },
            '11': { id: '1355051681959907422', emoji: '1️⃣1️⃣' },
            '12': { id: '1355051685025939467', emoji: '1️⃣2️⃣' },
            '13': { id: '1355051688003768373', emoji: '1️⃣3️⃣' },
            '14': { id: '1355051691006886000', emoji: '1️⃣4️⃣' },
            '15': { id: '1355051694483832977', emoji: '1️⃣5️⃣' }
        };

        // Define War roles with minimum stars
        const warRoles = {
            '1355081698050695208': { minStars: 1000 }, // War Hero role ID
            '1355081700387614800': { minStars: 500 },  // War Veteran role ID
            '1355081702296940614': { minStars: 200 },  // War Regular role ID
            '1355081704205586563': { minStars: 50 }    // War Participant role ID
        };

        // Define Donation roles with minimum donations
        const donationRoles = {
            '1355081705463115817': { minDonations: 10000 }, // Legendary Donor role ID
            '1355081707023663296': { minDonations: 5000 },  // Epic Donor role ID
            '1355081708869197955': { minDonations: 2000 },  // Super Donor role ID
            '1355081710622236693': { minDonations: 1000 }   // Active Donor role ID
        };

        // Update directly using updateOne
        const result = await Clan.updateOne(
            { _id: clan._id },
            {
                $set: {
                    'settings.roles.townHall': thRoles,
                    'settings.roles.warActivity': warRoles,
                    'settings.roles.donationTier': donationRoles
                }
            }
        );

        console.log('Update result:', result);

        // Verify the update
        const updatedClan = await Clan.findOne({ _id: clan._id });
        console.log('\nVerified role settings in database:');
        console.log(JSON.stringify(updatedClan.settings.roles, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();