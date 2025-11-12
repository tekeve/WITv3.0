const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// --- This will be configured by initializeLogger() ---
let transports;
const logDir = path.join(__dirname, '..', 'logs');

// --- 1. Define our Custom Levels and Colors ---
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        success: 3,
        http: 4,
        verbose: 5,
        debug: 6,
        silly: 7
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'blue',
        success: 'green',
        http: 'magenta',
        verbose: 'cyan',
        debug: 'white',
        silly: 'grey'
    }
};

// --- 2. Tell winston about our new colors ---
winston.addColors(customLevels.colors);

/**
 * Initializes the logger transports. This should be called once at startup.
 */
function initializeLogger() {
    // --- Create 'logs' directory if it doesn't exist ---
    // This prevents a synchronous crash on startup
    if (!fs.existsSync(logDir)) {
        try {
            fs.mkdirSync(logDir, { recursive: true });
            console.log(`Log directory created at: ${logDir}`);
        } catch (error) {
            console.error(`Failed to create log directory: ${error.message}`);
            process.exit(1);
        }
    }

    const consoleFormat = winston.format.combine(
        winston.format.colorize(), // <-- This will use our customColors
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.label({ label: 'MainApp' }), // Default label
        winston.format.printf(info => {
            // This logic is now in a separate function
            return formatLogMessage(info);
        })
    );
    transports = [
        // Console transport
        new winston.transports.Console({
            level: process.env.LOG_LEVEL || 'debug', // Default to 'debug'
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
        levels: customLevels.levels,
        transports: transports,
        exitOnError: false, // Don't crash on unhandled exceptions
    });
}

/**
 * Formats a log message, checking for error stacks.
 * @param {object} info - The winston log info object
 * @returns {string} The formatted log message
 */
function formatLogMessage(info) {
    let logMessage = `${info.timestamp} [${info.level}] [${info.label}]: ${info.message}`;

    // Check for an error object passed in the metadata (e.g., logger.error('msg', { error: err }))
    if (info.error) {
        logMessage += `\n${info.error.stack || info.error.message || info.error}`;
    }
    // Check if the info object *is* an error (e.g., logger.error(err))
    else if (info.stack) {
        logMessage += `\n${info.stack}`;
    }
    // Handle other metadata (e.g., logger.info('msg', { ...metadata }))
    else {
        // This makes sure all other metadata is printed
        const metadata = Object.assign({}, info, {
            level: undefined,
            label: undefined,
            message: undefined,
            timestamp: undefined,
        });
        const keys = Object.keys(metadata);
        if (keys.length > 0 && keys.some(key => metadata[key] !== undefined)) {
            // Only stringify if there's non-error metadata
            try {
                logMessage += ` ${JSON.stringify(metadata, null, 2)}`;
            } catch (e) {
                // ignore circular refs
            }
        }
    }

    return logMessage;
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
        levels: customLevels.levels,
        transports: transports,
        format: winston.format.combine(
            winston.format.label({ label })
            // Note: The printf format is applied *per-transport*, not here.
        ),
    });
}

module.exports = {
    initializeLogger,
    getLogger,
};