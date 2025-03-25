const mongoose = require('mongoose');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
    }

    /**
     * Connect to MongoDB
     * @returns {Promise<mongoose.Connection>} MongoDB connection
     */
    async connect() {
        try {
            if (this.isConnected) {
                console.log('Using existing database connection');
                return this.connection;
            }

            console.log('Creating new database connection...');

            // Connect to MongoDB
            const connection = await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });

            this.connection = connection;
            this.isConnected = true;

            console.log('Database connection established successfully');
            return this.connection;
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
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
module.exports = databaseService;