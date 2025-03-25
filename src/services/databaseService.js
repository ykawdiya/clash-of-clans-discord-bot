const mongoose = require('mongoose');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
        this.connectingPromise = null;
    }

    /**
     * Connect to MongoDB
     * @returns {Promise<mongoose.Connection>} MongoDB connection
     */
    async connect() {
        if (this.isConnected) {
            console.log('Using existing database connection');
            return this.connection;
        }

        if (this.connectingPromise) {
            console.log('Database connection in progress, waiting...');
            return this.connectingPromise;
        }

        console.log('Creating new database connection...');
        this.connectingPromise = mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        try {
            this.connection = await this.connectingPromise;
            this.isConnected = true;
            console.log('Database connection established successfully');
            return this.connection;
        } catch (error) {
            console.error('Database connection error:', error);
            this.isConnected = false;
            throw error;
        } finally {
            this.connectingPromise = null;
        }
    }

    /**
     * Close MongoDB connection
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            await mongoose.disconnect();
            this.isConnected = false;
            this.connection = null;
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error closing database connection:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected! Reconnecting...');
    databaseService.connect().catch(err => console.error('Reconnection failed:', err));
});
module.exports = databaseService;