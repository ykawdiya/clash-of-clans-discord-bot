// fix-clans.js
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

async function connectDatabase() {
    console.log('Connecting to database...');
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB!');
        return true;
    } catch (error) {
        console.error('Database connection error:', error.message);
        return false;
    }
}

async function findProblematicClans() {
    console.log('Looking for problematic clan records...');

    // Directly use MongoDB driver for more flexibility
    const client = mongoose.connection.getClient();
    const db = client.db();
    const clanCollection = db.collection('clans');

    // Find clans with missing guildId or clanTag
    const problematicClans = await clanCollection.find({
        $or: [
            { guildId: { $exists: false } },
            { guildId: null },
            { guildId: "" },
            { clanTag: { $exists: false } },
            { clanTag: null },
            { clanTag: "" }
        ]
    }).toArray();

    console.log(`Found ${problematicClans.length} problematic clan records:`);

    problematicClans.forEach((clan, index) => {
        console.log(`\n[${index + 1}] Clan ID: ${clan._id}`);
        console.log(`  Name: ${clan.name || 'Not set'}`);
        console.log(`  Tag: ${clan.clanTag || 'MISSING'}`);
        console.log(`  Guild ID: ${clan.guildId || 'MISSING'}`);
    });

    return problematicClans;
}

async function fixOrRemoveClans(problematicClans) {
    if (problematicClans.length === 0) {
        console.log('No problematic clans to fix.');
        return;
    }

    const client = mongoose.connection.getClient();
    const db = client.db();
    const clanCollection = db.collection('clans');

    console.log('\nChoose an action:');
    console.log('1. Remove all problematic clan records');
    console.log('2. Fix a specific clan record');

    // In a real script, you'd prompt for user input
    // For this example, we'll remove the problematic records

    console.log('\nRemoving all problematic records...');

    for (const clan of problematicClans) {
        await clanCollection.deleteOne({ _id: clan._id });
        console.log(`Deleted clan: ${clan._id}`);
    }

    console.log('\nProblematic records have been removed.');
}

async function verifyFix() {
    console.log('\nVerifying the fix...');

    const remainingProblematic = await findProblematicClans();

    if (remainingProblematic.length === 0) {
        console.log('Great! No more problematic clan records found.');
    } else {
        console.log(`There are still ${remainingProblematic.length} problematic records.`);
    }
}

async function main() {
    const connected = await connectDatabase();
    if (!connected) return;

    try {
        const problematicClans = await findProblematicClans();
        await fixOrRemoveClans(problematicClans);
        await verifyFix();
    } catch (error) {
        console.error('Error during fix process:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database');
    }
}

main();