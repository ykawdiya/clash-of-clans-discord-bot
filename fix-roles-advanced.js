// fix-roles-advanced.js
require('dotenv').config();
const mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;

async function main() {
    // Connect using Mongoose first
    try {
        console.log('Connecting to MongoDB using Mongoose...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected via Mongoose!');

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
        console.log(`Guild ID: ${clan.guildId}`);

        // Inspect current document structure in detail
        console.log('\nCurrent document structure:');
        console.log(JSON.stringify(clan.toObject(), null, 2));

        // Now try with direct MongoDB access for comparison
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        console.log('Connected via MongoDB native driver!');

        const db = client.db();
        const clanCollection = db.collection('clans');

        // Check if settings field exists and what type it is
        const rawClan = await clanCollection.findOne({ _id: clan._id });
        console.log('\nRaw clan from MongoDB:');
        console.log(JSON.stringify(rawClan, null, 2));

        console.log('\nAttempting fixes with multiple approaches...');

        // 1. Try using mongoose $set
        console.log('\n1. Mongoose $set approach:');
        const roleData = {
            "leader": "1355584131526033620",
            "coLeader": "1355584132830462163",
            "elder": "1355584134063591445",
            "member": "1355584135133008113"
        };

        try {
            const updateResult = await Clan.updateOne(
                { _id: clan._id },
                { $set: { 'settings.roles.clanRole': roleData } }
            );
            console.log('Update result:', updateResult);

            // Check if it worked
            const checkClan1 = await Clan.findOne({ _id: clan._id });
            console.log('Checking result after Mongoose $set:');
            console.log(checkClan1.settings?.roles?.clanRole || 'Not found');
        } catch (error) {
            console.error('Error with Mongoose $set:', error.message);
        }

        // 2. Try using native MongoDB update
        console.log('\n2. Native MongoDB update approach:');
        try {
            const updateResult = await clanCollection.updateOne(
                { _id: clan._id },
                { $set: { 'settings.roles.clanRole': roleData } }
            );
            console.log('Update result:', updateResult);

            // Check if it worked
            const checkDoc = await clanCollection.findOne({ _id: clan._id });
            console.log('Checking result after native update:');
            console.log(checkDoc.settings?.roles?.clanRole || 'Not found');
        } catch (error) {
            console.error('Error with native update:', error.message);
        }

        // 3. Try fully replacing the settings object
        console.log('\n3. Full settings replacement approach:');
        try {
            // Create a complete settings object
            const fullSettings = {
                channels: clan.settings?.channels || {},
                roles: {
                    clanRole: roleData,
                    // Include any other role settings that may exist
                    townHall: clan.settings?.roles?.townHall || {},
                    warActivity: clan.settings?.roles?.warActivity || {},
                    donationTier: clan.settings?.roles?.donationTier || {}
                },
                notifications: clan.settings?.notifications || {}
            };

            const updateResult = await clanCollection.updateOne(
                { _id: clan._id },
                { $set: { settings: fullSettings } }
            );
            console.log('Update result:', updateResult);

            // Check if it worked
            const checkDoc = await clanCollection.findOne({ _id: clan._id });
            console.log('Checking result after settings replacement:');
            console.log(checkDoc.settings?.roles?.clanRole || 'Not found');

            // If this worked, the issue might be with schema validation
            if (checkDoc.settings?.roles?.clanRole) {
                console.log('\nSuccess! The settings object has been properly saved.');
                console.log('This suggests the issue is with the Mongoose schema validation or handling of nested objects.');
            }
        } catch (error) {
            console.error('Error with settings replacement:', error.message);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        try {
            await mongoose.disconnect();
            console.log('Disconnected from Mongoose');
        } catch (e) {
            console.error('Error disconnecting from Mongoose:', e);
        }

        try {
            if (client) await client.close();
            console.log('Disconnected from MongoDB client');
        } catch (e) {
            console.error('Error closing MongoDB client:', e);
        }
    }
}

main();