// Create a test file: test-logger.js
const { logger, system, discord, api, db, commands } = require('./src/utils/logger');

function testLogger() {
    console.log("Testing logging system...");

    // Test main logger
    logger.info("This is a test info message");
    logger.warn("This is a test warning message");
    logger.error("This is a test error message");

    // Test context loggers
    system.info("System info message");
    discord.info("Discord info message");
    api.info("API info message", { endpoint: "/clans", requestTime: 125 });
    db.info("Database info message");
    commands.info("Command info message", { command: "clan", user: "123456789", executionTime: 532 });

    // Test error with stack trace
    try {
        throw new Error("Test error");
    } catch (error) {
        system.error("Error occurred", { error: error.message, stack: error.stack });
    }

    console.log("✅ Logging test complete. Check the logs directory for output files.");
}

testLogger();