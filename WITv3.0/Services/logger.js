const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// This will be configured by initializeLogger()
let transports;
const logDir = path.join(__dirname, '..', 'logs');

/**
 * Initializes the logger transports. This should be called once at startup.
 */
function initializeLogger() {
    const consoleFormat = winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.label({ label: 'MainApp' }), // Default label
        winston.format.printf(info => {
            let logMessage = `${info.timestamp} [${info.level}] [${info.label}]: ${info.message}`;

            // Check for an error object passed in the metadata (e.g., logger.error('msg', { error: err }))
            // This is the key fix:
            if (info.error) {
                logMessage += `\n${info.error.stack || info.error.message || info.error}`;
            }
            // Check if the info object *is* an error (e.g., logger.error(err))
            else if (info.stack) {
                logMessage += `\n${info.stack}`;
            }

            return logMessage;
        })
    );
    transports = [
        // Console transport
        new winston.transports.Console({
            level: process.env.LOG_LEVEL || 'info', // Default to 'info'
            format: consoleFormat,
            handleExceptions: true,
        }),
        new DailyRotateFile({
            level: 'debug',
            filename: path.join(logDir, 'wit-bot-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '90d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
        }),
        new DailyRotateFile({
            level: 'error',
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m', 
            maxFiles: '90d',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
        }),
    ];

    // Create the global logger (for unhandled exceptions)
    winston.configure({
        transports: transports,
        exitOnError: false, // Don't crash on unhandled exceptions
    });
}

/**
 * Gets a new logger instance with a specific service context.
 * @param {string} context - The name of the module/plugin (e.g., 'PluginManager', 'MyPlugin').
 * @returns {winston.Logger} A logger instance.
 */
function getLogger(label = 'MainApp') {
    if (!transports) {
        // Fallback for case where logger is called before init
        // This shouldn't happen with the new app.js structure, but is safe.
        console.warn('Logger not initialized. Initializing with default console transport.');
        initializeLogger();
    }

    // Create a new logger instance with the specified label
    return winston.createLogger({
        levels: winston.config.npm.levels,
        transports: transports,
        format: winston.format.combine(
            winston.format.label({ label })
        ),
    });
}

module.exports = {
    initializeLogger,
    getLogger,
};