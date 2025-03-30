// cleanup-db.js - Simplified version
require('dotenv').config();
const mongoose = require('mongoose');

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to database');

        const db = mongoose.connection.db;
        const clanCollection = db.collection('clans');

        // Just remove the entire roles object instead of individual fields
        const result = await clanCollection.updateMany(
            {},
            { $unset: { "settings.roles": "" } }
        );

        console.log(`Updated ${result.modifiedCount} clan documents`);

        // Verify the update
        const sampleClan = await clanCollection.findOne({});
        console.log('Sample clan after update:',
            sampleClan.settings ?
                'settings.roles exists: ' + (sampleClan.settings.roles !== undefined) :
                'No settings object found');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database');
    }
}

cleanup();