// scripts/migrate-clan-roles.js
require('dotenv').config();
const mongoose = require('mongoose');

async function migrateClanRoles() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB!');

        console.log('Starting clan document migration...');

        const db = mongoose.connection.db;
        const clanCollection = db.collection('clans');

        // Find all clan documents
        const clans = await clanCollection.find({}).toArray();
        console.log(`Found ${clans.length} clan documents to check`);

        let updatedCount = 0;

        for (const clan of clans) {
            // Only process clans with the old roles structure
            if (clan.settings && clan.settings.roles) {
                console.log(`Migrating clan: ${clan.name} (${clan.clanTag})`);

                // Create the new mentionRoles structure
                const mentionRoles = {
                    everyone: clan.settings.roles.everyone || null,
                    elder: clan.settings.roles.elder || null,
                    coLeader: clan.settings.roles.coLeader || null,
                    leader: clan.settings.roles.leader || null
                };

                // Update the document with the new structure
                const result = await clanCollection.updateOne(
                    { _id: clan._id },
                    {
                        $unset: { "settings.roles": "" },
                        $set: { "settings.mentionRoles": mentionRoles }
                    }
                );

                if (result.modifiedCount > 0) {
                    updatedCount++;
                }
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} clan documents.`);

        // Verify a random clan
        if (clans.length > 0) {
            const sampleClan = await clanCollection.findOne({_id: clans[0]._id});
            console.log('Sample clan after update:');
            console.log('- Old roles field exists:', sampleClan.settings && sampleClan.settings.roles !== undefined);
            console.log('- New mentionRoles field exists:', sampleClan.settings && sampleClan.settings.mentionRoles !== undefined);
        }

    } catch (error) {
        console.error('Error during migration:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database');
    }
}

// Run the migration
migrateClanRoles().catch(console.error);