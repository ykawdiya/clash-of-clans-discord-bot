const mongoose = require('mongoose');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectTimeout = null;
        this.lastError = null;
    }

    /**
     * Connect to MongoDB
     * @param {boolean} isReconnect - Whether this is a reconnection attempt
     * @returns {Promise<mongoose.Connection>} MongoDB connection
     */
    async connect(isReconnect = false) {
        try {
            if (this.isConnected && mongoose.connection.readyState === 1) {
                console.log('Using existing database connection');
                return this.connection;
            }

            // Check for MongoDB URI
            if (!process.env.MONGODB_URI) {
                this.lastError = new Error('MONGODB_URI environment variable is not set');
                throw this.lastError;
            }

            console.log(`${isReconnect ? 'Reconnecting' : 'Creating new'} database connection...`);
            this.connectionAttempts++;

            // Set up connection options with proper timeouts
            const connectionOptions = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000
            };

            // Connect to MongoDB
            await mongoose.connect(process.env.MONGODB_URI, connectionOptions);

            // Verify connection is active by performing a simple operation
            await mongoose.connection.db.admin().ping();

            this.connection = mongoose.connection;
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.lastError = null;

            console.log('Database connection established successfully');
            console.log(`Connection state: ${mongoose.connection.readyState}`);

            // Set up error handlers for the connection
            mongoose.connection.on('error', this._handleConnectionError.bind(this));
            mongoose.connection.on('disconnected', this._handleDisconnect.bind(this));

            return this.connection;
        } catch (error) {
            this.isConnected = false;
            this.lastError = error;
            console.error('Database connection error:', error);

            // Provide more specific error information
            if (error.name === 'MongoServerSelectionError') {
                console.error('Could not connect to MongoDB server. Check your connection string and make sure the server is running.');
            } else if (error.name === 'MongoParseError') {
                console.error('Invalid MongoDB connection string. Please check your MONGODB_URI environment variable.');
            }

            // Attempt to reconnect if within retry limits
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
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
                console.error(`Failed to connect after ${this.maxConnectionAttempts} attempts. Continuing without database.`);
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
        this.lastError = error;
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

        this.connectionAttempts = 0;
        console.log('Attempting to reconnect to MongoDB...');

        this.reconnectTimeout = setTimeout(() => {
            this.connect(true).catch(err => {
                console.error('Reconnection attempt failed:', err);
            });
        }, 5000);
    }

    /**
     * Close MongoDB connection
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            mongoose.connection.removeAllListeners('error');
            mongoose.connection.removeAllListeners('disconnected');

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
        const connected = this.isConnected &&
            mongoose.connection &&
            mongoose.connection.readyState === 1;

        if (!connected && this.isConnected) {
            console.warn('Database connection state mismatch! this.isConnected=true but mongoose.connection.readyState!=1');
            this.isConnected = false;
        }

        return connected;
    }

    /**
     * Get the last connection error
     * @returns {Error|null} Last error
     */
    getLastError() {
        return this.lastError;
    }

    /**
     * Get the current connection status information
     * @returns {Object} Connection status info
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection ? mongoose.connection.readyState : -1,
            connectionAttempts: this.connectionAttempts,
            hasError: !!this.lastError,
            errorMessage: this.lastError ? this.lastError.message : null
        };
    }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService;