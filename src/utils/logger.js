// src/utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

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

// Create daily rotating file transports
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  format: fileFormat,
  maxSize: '2m',
  maxFiles: 3,
  zippedArchive: true,
  auditFile: path.join(logsDir, 'error-audit.json')
});

const combinedFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  format: fileFormat,
  maxSize: '3m',
  maxFiles: 2,
  zippedArchive: true,
  auditFile: path.join(logsDir, 'combined-audit.json')
});

// Add error handling for the file transports
errorFileTransport.on('error', (error) => {
  console.error('Error in error log file transport:', error);
});

combinedFileTransport.on('error', (error) => {
  console.error('Error in combined log file transport:', error);
});

// Create the base logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'clash-bot' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    errorFileTransport,
    combinedFileTransport
  ],
  // Add a custom format to filter out excessive or redundant logs
  format: winston.format.combine(
      winston.format((info) => {
        // Skip logging huge objects or very long strings to save space
        if (typeof info.message === 'string' && info.message.length > 1000) {
          info.message = info.message.substring(0, 1000) + '... [truncated]';
        }
        return info;
      })()
  ),
  // Add a limit on concurrent logging operations to prevent overwhelming the disk
  handleExceptions: true,
  exitOnError: false
});

// Set up automatic cleanup of old log files (keep only last 7 days)
function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    for (const file of files) {
      if (file.endsWith('.log') || file.endsWith('.gz')) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old log file: ${file}`);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
  }
}

// Run cleanup on startup and once a day
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// Create specialized loggers for different components
const systemLogger = baseLogger.child({ component: 'system' });
const apiLogger = baseLogger.child({ component: 'api' });
const commandLogger = baseLogger.child({ component: 'command' });
const eventLogger = baseLogger.child({ component: 'event' });

// Add rate limiting to prevent log flooding
const maxLogsPerMinute = 300;
let logCounter = 0;
let lastResetTime = Date.now();

// Middleware function to apply rate limiting to all loggers
function rateLimitedLog(logger, level) {
  const originalMethod = logger[level];

  logger[level] = function(...args) {
    const now = Date.now();

    // Reset counter after a minute
    if (now - lastResetTime > 60000) {
      logCounter = 0;
      lastResetTime = now;
    }

    // Check if we've exceeded the limit
    if (logCounter >= maxLogsPerMinute && level !== 'error') {
      // Only log once when rate limit is hit
      if (logCounter === maxLogsPerMinute) {
        originalMethod.call(logger, `Log rate limit exceeded. Some logs will be suppressed.`);
      }
      logCounter++;
      return;
    }

    logCounter++;
    originalMethod.apply(logger, args);
  };
}

// Apply rate limiting to all loggers
const levels = ['debug', 'info', 'warn', 'error'];
const loggers = [systemLogger, apiLogger, commandLogger, eventLogger, baseLogger];

for (const logger of loggers) {
  for (const level of levels) {
    rateLimitedLog(logger, level);
  }
}

module.exports = {
  system: systemLogger,
  api: apiLogger,
  command: commandLogger,
  event: eventLogger,
  // Allow direct access to the base logger if needed
  base: baseLogger
};