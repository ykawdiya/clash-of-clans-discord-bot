// Save this as test-db.js in your project root
// Run with: node test-db.js

require('dotenv').config();
const mongoose = require('mongoose');

async function testDatabaseConnection() {
    console.log('Testing database connection...');

    // Check if MongoDB URI is set
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI environment variable is not set!');
        process.exit(1);
    }

    console.log(`Connecting to: ${process.env.MONGODB_URI.substring(0, 20)}...`);

    try {
        // Try to connect
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000 // Short timeout for faster feedback
        });

        console.log('✅ Successfully connected to the database!');

        // Check connection state
        console.log(`Connection state: ${mongoose.connection.readyState}`);
        // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

        // Test creating a model and checking if collections are accessible
        const TestModel = mongoose.model('TestModel', new mongoose.Schema({
            name: String,
            timestamp: { type: Date, default: Date.now }
        }));

        // Try to create a test document
        const testDoc = await TestModel.create({
            name: 'Test connection ' + Date.now()
        });

        console.log('✅ Successfully created test document:', testDoc);

        // Clean up
        await TestModel.deleteOne({ _id: testDoc._id });
        console.log('✅ Successfully deleted test document');

        // List all collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:');
        collections.forEach(collection => {
            console.log(`- ${collection.name}`);
        });

        // Check if Clan model collection exists
        const clanCollectionExists = collections.some(
            collection => collection.name === 'clans'
        );

        if (clanCollectionExists) {
            console.log('✅ Clan collection exists');
        } else {
            console.log('⚠️ Warning: Clan collection does not exist yet');
        }

        // Disconnect
        await mongoose.disconnect();
        console.log('Database connection closed');

    } catch (error) {
        console.error('❌ Database connection error:', error.message);

        // Provide more specific information based on the error
        if (error.name === 'MongoServerSelectionError') {
            console.error('Could not connect to any MongoDB server.');
            console.error('Possible causes:');
            console.error('1. Incorrect connection string');
            console.error('2. MongoDB server is not running');
            console.error('3. Network issues or firewall blocking connection');
            console.error('4. Authentication failed');
        }

        // Log more detailed error information
        console.error('Error details:', {
            name: error.name,
            code: error.code,
            message: error.message
        });

        if (error.code === 'ENOTFOUND') {
            console.error('Hostname in MongoDB URI could not be resolved. Check your connection string.');
        } else if (error.message.includes('bad auth')) {
            console.error('Authentication failed. Check your username and password in the connection string.');
        }
    }
}

// Run the test
testDatabaseConnection();