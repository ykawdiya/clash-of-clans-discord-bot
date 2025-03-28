const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, align } = format;
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, context, ...metadata }) => {
    const metaString = Object.keys(metadata).length ?
        `\n${JSON.stringify(metadata, null, 2)}` : '';

    return `[${timestamp}] ${level.toUpperCase()} ${context ? `[${context}] ` : ''}${message}${metaString}`;
});

// Create the logger
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    defaultMeta: { service: 'coc-discord-bot' },
    transports: [
        // Console transport with colors for development
        new transports.Console({
            format: combine(
                colorize({ all: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                align(),
                consoleFormat
            ),
        }),
        // File transport for all logs
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        }),
        // Separate file for errors
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        })
    ],
    exceptionHandlers: [
        new transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        })
    ],
    rejectionHandlers: [
        new transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        })
    ]
});

// Add a stream for Morgan HTTP request logging
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

// Create child loggers for specific contexts
const createContextLogger = (context) => {
    return {
        error: (message, meta = {}) => logger.error(message, { context, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
        info: (message, meta = {}) => logger.info(message, { context, ...meta }),
        http: (message, meta = {}) => logger.http(message, { context, ...meta }),
        verbose: (message, meta = {}) => logger.verbose(message, { context, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
        silly: (message, meta = {}) => logger.silly(message, { context, ...meta })
    };
};

// Create specific loggers for different components
const loggers = {
    system: createContextLogger('system'),
    discord: createContextLogger('discord'),
    api: createContextLogger('api'),
    db: createContextLogger('database'),
    commands: createContextLogger('commands'),
    events: createContextLogger('events'),
    services: createContextLogger('services')
};

module.exports = {
    logger,
    ...loggers
};