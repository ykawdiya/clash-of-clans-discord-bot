// jest.setup.js
// This file runs before all tests

// Mock winston logger to prevent console spam during tests
jest.mock('winston', () => {
    const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        log: jest.fn()
    };

    return {
        createLogger: jest.fn().mockReturnValue(mockLogger),
        format: {
            combine: jest.fn(),
            timestamp: jest.fn(),
            printf: jest.fn(),
            colorize: jest.fn(),
            align: jest.fn(),
            json: jest.fn(),
            errors: jest.fn(),
            splat: jest.fn()
        },
        transports: {
            Console: jest.fn(),
            File: jest.fn()
        }
    };
});

// Fix environment for tests
process.env.NODE_ENV = 'test';

// Fix issue with timers
afterEach(() => {
    jest.useRealTimers();
});

// Add this to the end of your jest.setup.js file

// Workaround for tests hanging due to open handles
let originalConsoleError = console.error;
console.error = function(...args) {
    if (args[0]?.includes?.('Cannot log after tests are done')) {
        return;
    }
    originalConsoleError.apply(console, args);
};

// Close database connection after tests
afterAll(async () => {
    try {
        await mongoose.connection.close();
    } catch (e) {
        // Ignore errors when closing connection
    }
});

// Ensure database services are properly closed
const databaseService = require('./src/services/databaseService');
afterAll(async () => {
    if (databaseService.isConnected) {
        await databaseService.disconnect();
    }

    // Clear any remaining timeouts
    jest.clearAllTimers();
});