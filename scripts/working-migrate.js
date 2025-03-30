// scripts/working-migrate.js
const mongoose = require('mongoose');

// Clean connection string without invalid parameters
const mongoUri = 'mongodb+srv://yashkawdiya2681:b2K97OOOmYvWd7of@doscordbot.iocwn.mongodb.net/test';

async function migrateClanRoles() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB!');

        console.log('Starting clan document migration...');

        const db = mongoose.connection.db;
        const clanCollection = db.collection('clans');

        // First, let's check what data we actually have
        console.log('Checking clan documents structure...');
        const sampleClan = await clanCollection.findOne({});

        if (sampleClan) {
            console.log('Found clan document:');
            console.log('- Has settings:', !!sampleClan.settings);
            console.log('- Has roles:', sampleClan.settings && !!sampleClan.settings.roles);

            // Print the structure if roles exists
            if (sampleClan.settings && sampleClan.settings.roles) {
                console.log('Current roles structure:', JSON.stringify(sampleClan.settings.roles, null, 2));
            }
        } else {
            console.log('No clan documents found in database.');
            return;
        }

        // Find all clan documents with roles
        const clansWithRoles = await clanCollection.find({
            "settings.roles": { $exists: true }
        }).toArray();

        console.log(`Found ${clansWithRoles.length} clan documents with roles structure.`);

        if (clansWithRoles.length === 0) {
            console.log('No migration needed!');
            return;
        }

        let updatedCount = 0;

        for (const clan of clansWithRoles) {
            console.log(`Migrating clan: ${clan.name || clan.clanTag}`);

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

        console.log(`Migration complete. Updated ${updatedCount} clan documents.`);

        // Verify a random clan after update
        if (clansWithRoles.length > 0) {
            const sampleClanAfter = await clanCollection.findOne({_id: clansWithRoles[0]._id});
            console.log('Sample clan after update:');
            console.log('- Old roles field exists:', sampleClanAfter.settings && sampleClanAfter.settings.roles !== undefined);
            console.log('- New mentionRoles field exists:', sampleClanAfter.settings && sampleClanAfter.settings.mentionRoles !== undefined);

            if (sampleClanAfter.settings && sampleClanAfter.settings.mentionRoles) {
                console.log('New mentionRoles structure:', JSON.stringify(sampleClanAfter.settings.mentionRoles, null, 2));
            }
        }

    } catch (error) {
        console.error('Error during migration:', error);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
            console.log('Disconnected from database');
        }
    }
}

// Run the migration
migrateClanRoles().catch(error => {
    console.error('Unhandled error during migration:', error);
    process.exit(1);
});