const mongoose = require('mongoose');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectTimeout = null;
    }

    /**
     * Connect to MongoDB
     * @param {boolean} isReconnect - Whether this is a reconnection attempt
     * @returns {Promise<mongoose.Connection>} MongoDB connection
     */
    async connect(isReconnect = false) {
        try {
            if (this.isConnected) {
                console.log('Using existing database connection');
                return this.connection;
            }

            // Check for MongoDB URI
            if (!process.env.MONGODB_URI) {
                throw new Error('MONGODB_URI environment variable is not set');
            }

            console.log(`${isReconnect ? 'Reconnecting' : 'Creating new'} database connection...`);
            this.connectionAttempts++;

            // Set up connection options with proper timeouts
            const connectionOptions = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 10000, // 10 seconds for server selection timeout
                connectTimeoutMS: 10000, // 10 seconds for connection timeout
                socketTimeoutMS: 45000 // 45 seconds for socket timeout
            };

            // Connect to MongoDB
            const connection = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);

            this.connection = connection;
            this.isConnected = true;
            this.connectionAttempts = 0; // Reset counter on successful connection

            console.log('Database connection established successfully');

            // Set up error handlers for the connection
            mongoose.connection.on('error', this._handleConnectionError.bind(this));
            mongoose.connection.on('disconnected', this._handleDisconnect.bind(this));

            return this.connection;
        } catch (error) {
            console.error('Database connection error:', error);

            // Attempt to reconnect if within retry limits
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000); // Exponential backoff, max 30s
                console.log(`Retrying connection in ${delay/1000} seconds (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})...`);

                // Clear any existing timeout
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                }

                // Set up reconnection
                this.reconnectTimeout = setTimeout(() => {
                    this.connect(true).catch(err => {
                        console.error('Reconnection attempt failed:', err);
                    });
                }, delay);
            } else {
                console.error(`Failed to connect after ${this.maxConnectionAttempts} attempts. Giving up.`);
            }

            throw error;
        }
    }

    /**
     * Handle connection errors
     * @private
     */
    _handleConnectionError(error) {
        console.error('MongoDB connection error:', error);
        if (this.isConnected) {
            this.isConnected = false;
            this._attemptReconnect();
        }
    }

    /**
     * Handle disconnection events
     * @private
     */
    _handleDisconnect() {
        console.log('MongoDB disconnected');
        this.isConnected = false;
        this._attemptReconnect();
    }

    /**
     * Attempt to reconnect to MongoDB
     * @private
     */
    _attemptReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.connectionAttempts = 0; // Reset counter for reconnection attempts
        console.log('Attempting to reconnect to MongoDB...');

        this.reconnectTimeout = setTimeout(() => {
            this.connect(true).catch(err => {
                console.error('Reconnection attempt failed:', err);
            });
        }, 5000); // Wait 5 seconds before first reconnection attempt
    }

    /**
     * Close MongoDB connection
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            // Clear any reconnection timeouts
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            // Remove event listeners
            mongoose.connection.removeAllListeners('error');
            mongoose.connection.removeAllListeners('disconnected');

            // Close the connection
            await mongoose.disconnect();
            this.isConnected = false;
            this.connection = null;
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error closing database connection:', error);
            throw error;
        }
    }

    /**
     * Check if database is connected
     * @returns {boolean} Connection status
     */
    checkConnection() {
        return this.isConnected &&
            mongoose.connection &&
            mongoose.connection.readyState === 1; // 1 = connected
    }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService;