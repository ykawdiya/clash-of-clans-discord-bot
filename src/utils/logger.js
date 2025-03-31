// src/utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Define log formats
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create the base logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'clash-bot' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
});

// Create specialized loggers for different components
const systemLogger = baseLogger.child({ component: 'system' });
const apiLogger = baseLogger.child({ component: 'api' });
const commandLogger = baseLogger.child({ component: 'command' });
const eventLogger = baseLogger.child({ component: 'event' });

module.exports = {
  system: systemLogger,
  api: apiLogger,
  command: commandLogger,
  event: eventLogger,
  // Allow direct access to the base logger if needed
  base: baseLogger
};
