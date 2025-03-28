const mongoose = require('mongoose');
const { EventEmitter } = require('events');
const { db: log } = require('../utils/logger');

class DatabaseService extends EventEmitter {
    constructor() {
        super();
        this.isConnected = false;
        this.connection = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectTimeout = null;
        this.lastError = null;
        this.metrics = {
            operations: 0,
            errors: 0,
            lastOperation: null
        };

        // Ping timer to ensure connection stays alive
        this.pingInterval = null;
    }

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

            log.info(`${isReconnect ? 'Reconnecting' : 'Connecting'} to database...`);
            this.connectionAttempts++;

            // Set up connection options with shorter timeouts
            const connectionOptions = {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
                socketTimeoutMS: 30000,
                maxPoolSize: 10,
                heartbeatFrequencyMS: 10000,
                retryWrites: true,
                w: 'majority'
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

            log.info('Database connection established');

            // Set up error handlers
            this._setupErrorHandlers();

            // Start the ping timer to keep connection alive
            this._startPingTimer();

            // Emit connected event
            this.emit('connected');

            return this.connection;
        } catch (error) {
            this.isConnected = false;
            this.lastError = error;
            log.error('Database connection error', { error: error.message, stack: error.stack });

            // Emit error event
            this.emit('error', error);

            // Only retry if under max attempts
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
                log.info(`Retrying in ${delay/1000}s (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);

                this.reconnectTimeout = setTimeout(() => {
                    this.connect(true).catch(() => {});
                }, delay);
            } else {
                log.error(`Failed after ${this.maxConnectionAttempts} attempts. Continuing without database.`);
                this.emit('failedAfterMaxAttempts');
            }

            throw error;
        }
    }

    _setupErrorHandlers() {
        // Remove any existing listeners to prevent duplicates
        mongoose.connection.removeAllListeners('error');
        mongoose.connection.removeAllListeners('disconnected');

        // Add error handlers
        mongoose.connection.on('error', (error) => {
            log.error('MongoDB connection error', { error: error.message });
            this.lastError = error;
            this.isConnected = false;
            this.emit('error', error);
        });

        mongoose.connection.on('disconnected', () => {
            log.warn('MongoDB disconnected');
            this.isConnected = false;
            this.emit('disconnected');

            // Simple reconnection logic
            if (!this.reconnectTimeout) {
                this.reconnectTimeout = setTimeout(() => {
                    this.connectionAttempts = 0;
                    this.connect(true).catch(() => {});
                }, 5000);
            }
        });

        // Add connection monitoring
        mongoose.connection.on('reconnected', () => {
            log.info('MongoDB reconnected');
            this.isConnected = true;
            this.emit('reconnected');
        });
    }

    _startPingTimer() {
        // Clear any existing timer
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        // Set up a ping every 30 seconds to keep connection alive
        this.pingInterval = setInterval(async () => {
            if (this.isConnected) {
                try {
                    await mongoose.connection.db.admin().ping();
                    this.emit('ping');
                } catch (error) {
                    log.warn('Database ping failed', { error: error.message });
                    this.emit('pingFailed', error);
                }
            }
        }, 30000);
    }

    checkConnection() {
        const connected = mongoose.connection && mongoose.connection.readyState === 1;

        // Update our flag if there's a mismatch
        if (connected !== this.isConnected) {
            this.isConnected = connected;
        }

        return connected;
    }

    getStatus() {
        return {
            isConnected: this.checkConnection(),
            readyState: mongoose.connection ? mongoose.connection.readyState : -1,
            connectionAttempts: this.connectionAttempts,
            hasError: !!this.lastError,
            errorMessage: this.lastError ? this.lastError.message : null,
            metrics: { ...this.metrics }
        };
    }

    async disconnect() {
        if (!this.isConnected) return;

        try {
            // Clear timers
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
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
            log.info('Database connection closed');
            this.emit('disconnected');
        } catch (error) {
            log.error('Error disconnecting from database', { error: error.message });
            // Force reset connection state
            this.isConnected = false;
            this.connection = null;
        }
    }
}

// Create and export a singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService;