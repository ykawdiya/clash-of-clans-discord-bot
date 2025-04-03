// test-db-connection.js
require('dotenv').config();
const mongoose = require('mongoose');
const { system: log } = require('./src/utils/logger');

async function testConnection() {
    try {
        log.info('Testing MongoDB connection...');
        log.info(`Connection string: ${process.env.MONGODB_URI.replace(/\/\/(.+?):(.+?)@/, '//[username]:[password]@')}`);

        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        log.info('MongoDB connection successful!');

        // Check if models directory has the necessary files
        const fs = require('fs');
        const path = require('path');
        const modelsDir = path.join(__dirname, 'src', 'models');

        log.info('Checking models directory...');
        const files = fs.readdirSync(modelsDir);
        log.info(`Models found: ${files.join(', ')}`);

        // Test model imports
        log.info('Testing model imports...');
        const { Clan, User, WarTracking, CWLTracking, CapitalTracking } = require('./src/models');

        log.info(`Clan model: ${Clan ? 'Found' : 'Not found'}`);
        log.info(`User model: ${User ? 'Found' : 'Not found'}`);
        log.info(`WarTracking model: ${WarTracking ? 'Found' : 'Not found'}`);
        log.info(`CWLTracking model: ${CWLTracking ? 'Found' : 'Not found'}`);
        log.info(`CapitalTracking model: ${CapitalTracking ? 'Found' : 'Not found'}`);

        await mongoose.disconnect();
        log.info('MongoDB disconnected');
    } catch (error) {
        log.error('Error testing MongoDB connection:', { error: error.message, stack: error.stack });
    }
}

testConnection();