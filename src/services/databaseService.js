const mongoose = require('mongoose');

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.reconnectTimeout = null;
        this.lastError = null;
    }

    /**
     * Connect to MongoDB with improved error handling
     * @returns {Promise<mongoose.Connection>} MongoDB connection
     */
    async connect(isReconnect = false) {
        try {
            // Quick check for existing connection
            if (this.isConnected && mongoose.connection.readyState === 1) {
                return this.connection;
            }

            // Clear any existing reconnection timeout
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            console.log(`${isReconnect ? 'Reconnecting' : 'Connecting'} to database...`);
            this.connectionAttempts++;

            // Set up connection options with shorter timeouts
            const connectionOptions = {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
                socketTimeoutMS: 30000
            };

            // Connect to MongoDB with timeout race
            const connectPromise = mongoose.connect(process.env.MONGODB_URI, connectionOptions);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Connection timed out')), 7000));

            await Promise.race([connectPromise, timeoutPromise]);

            // Do a quick check to verify connection
            await mongoose.connection.db.admin().ping();

            this.connection = mongoose.connection;
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.lastError = null;

            console.log('Database connection established');

            // Set up minimal error handlers
            this._setupErrorHandlers();

            return this.connection;
        } catch (error) {
            this.isConnected = false;
            this.lastError = error;
            console.error('Database connection error:', error.message);

            // Only retry if under max attempts
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 10000);
                console.log(`Retrying in ${delay/1000}s (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);

                this.reconnectTimeout = setTimeout(() => {
                    this.connect(true).catch(() => {});
                }, delay);
            } else {
                console.error(`Failed after ${this.maxConnectionAttempts} attempts. Continuing without database.`);
            }

            throw error;
        }
    }

    /**
     * Set up minimal connection error handlers
     * @private
     */
    _setupErrorHandlers() {
        // Remove any existing listeners to prevent duplicates
        mongoose.connection.removeAllListeners('error');
        mongoose.connection.removeAllListeners('disconnected');

        // Add simplified error handlers
        mongoose.connection.on('error', (error) => {
            console.error('MongoDB connection error:', error.message);
            this.lastError = error;
            this.isConnected = false;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            this.isConnected = false;

            // Simple reconnection logic
            if (!this.reconnectTimeout) {
                this.reconnectTimeout = setTimeout(() => {
                    this.connectionAttempts = 0;
                    this.connect(true).catch(() => {});
                }, 5000);
            }
        });
    }

    /**
     * Check if database is connected with improved reliability
     * @returns {boolean} Connection status
     */
    checkConnection() {
        const connected = mongoose.connection && mongoose.connection.readyState === 1;

        // Update our flag if there's a mismatch
        if (connected !== this.isConnected) {
            this.isConnected = connected;
        }

        return connected;
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            isConnected: this.checkConnection(),
            readyState: mongoose.connection ? mongoose.connection.readyState : -1,
            connectionAttempts: this.connectionAttempts,
            hasError: !!this.lastError,
            errorMessage: this.lastError ? this.lastError.message : null
        };
    }

    /**
     * Disconnect from database
     */
    async disconnect() {
        if (!this.isConnected) return;

        try {
            // Clear any pending reconnection
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            // Remove listeners to prevent reconnection attempts
            mongoose.connection.removeAllListeners();

            // Disconnect with timeout protection
            await Promise.race([
                mongoose.disconnect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect timed out')), 5000))
            ]);

            this.isConnected = false;
            this.connection = null;
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error disconnecting from database:', error.message);
            // Force reset connection state
            this.isConnected = false;
            this.connection = null;
        }
    }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService;