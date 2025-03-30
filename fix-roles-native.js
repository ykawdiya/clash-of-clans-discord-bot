// fix-roles-native.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  let client;

  try {
    console.log('Connecting directly to MongoDB...');
    const uri = process.env.MONGODB_URI;
    client = new MongoClient(uri);
    await client.connect();

    console.log('Connected! Getting database name...');
    const dbName = uri.split('/').pop().split('?')[0];
    console.log(`Using database: ${dbName}`);

    const db = client.db(dbName);
    const collection = db.collection('clans');

    // Find the clan document
    const clan = await collection.findOne({});
    if (!clan) {
      console.log('No clan found in the database!');
      return;
    }

    console.log(`Found clan: ${clan.name} (${clan.clanTag})`);

    // Define role data
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

    const warRoles = {
      '1355081698050695208': { minStars: 1000 },
      '1355081700387614800': { minStars: 500 },
      '1355081702296940614': { minStars: 200 },
      '1355081704205586563': { minStars: 50 }
    };

    const donationRoles = {
      '1355081705463115817': { minDonations: 10000 },
      '1355081707023663296': { minDonations: 5000 },
      '1355081708869197955': { minDonations: 2000 },
      '1355081710622236693': { minDonations: 1000 }
    };

    console.log('Updating document with native driver...');

    // Update using the native MongoDB driver
    const result = await collection.updateOne(
      { _id: clan._id },
      {
        $set: {
          'settings.roles.townHall': thRoles,
          'settings.roles.warActivity': warRoles,
          'settings.roles.donationTier': donationRoles
        }
      }
    );

    console.log('Native update result:', result);

    // Verify the update
    const updatedDoc = await collection.findOne({ _id: clan._id });
    console.log('\nVerified role settings in database:');
    console.log(JSON.stringify(updatedDoc.settings.roles, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (client) await client.close();
    console.log('MongoDB client closed');
  }
}

main();