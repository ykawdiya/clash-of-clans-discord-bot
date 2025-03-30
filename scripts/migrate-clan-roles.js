// scripts/migrate-clan-roles.js
const fs = require('fs');
const path = require('path');

// Path resolution for .env file
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    // Load .env file from the parent directory
    require('dotenv').config({ path: envPath });
    console.log('Loaded environment from ../.env');
} else {
    // Try loading from current directory as fallback
    require('dotenv').config();
    console.log('Attempted to load environment from default location');
}

const mongoose = require('mongoose');

async function migrateClanRoles() {
    let mongoUri = process.env.MONGODB_URI;

    // Check for MongoDB URI from command line arguments
    const args = process.argv.slice(2);
    const uriArg = args.find(arg => arg.startsWith('--uri='));
    if (uriArg) {
        mongoUri = uriArg.split('=')[1];
        console.log('Using MongoDB URI from command line argument');
    }

    if (!mongoUri) {
        console.error('Missing MongoDB URI. Please ensure MONGODB_URI is set in your .env file.');
        console.log('Alternatively, you can provide it directly:');
        console.log('node migrate-clan-roles.js --uri=mongodb://your-connection-string');
        process.exit(1);
    }

    try {
        console.log('Connecting to database...');
        await mongoose.connect(mongoUri);
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