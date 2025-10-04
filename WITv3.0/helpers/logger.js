const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// --- PATH SETUP ---
// Directories for logs and errors
const logDir = path.join(__dirname, '../logs');
const errorDir = path.join(logDir, 'errors');
// The active log files will always be named 'latest.log'
const logPath = path.join(logDir, 'latest.log');
const errorPath = path.join(errorDir, 'latest.log');

// Create directories if they don't exist
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir);


// --- LOG LEVEL SETUP ---
// Determine the logging level based on command-line arguments
const args = process.argv.slice(2);
let isQuiet = false;
let isVerbose = false;
let isAudit = false;

if (args.includes('--quiet') || args.includes('-q')) {
    isQuiet = true;
    console.log(chalk.blue('[INFO] Logging quiet, only errors will be shown, log files will still be updated'));
} else if (args.includes('--verbose') || args.includes('-v') || args.includes('--loud') || args.includes('-l')) {
    isVerbose = true;
    console.log(chalk.blue('[INFO] Logging loud, all debugging messages will be shown'));
} else if (args.includes('--audit')) {
    isAudit = true;
    console.log(chalk.blue('[INFO] Logging audit, all audit messages will be shown'));
} else {
    console.log(chalk.blue('[INFO] Logging default, only errors and warnings will be shown, log files will still be updated'));
}


// --- MIDNIGHT LOG ROTATION ---
/**
 * Renames the 'latest.log' files to a date-stamped file from the previous day.
 * This function is called automatically at midnight.
 */
function rolloverLogs() {
    info('[LOGGER] Performing midnight log rollover...');
    // Get the date of the day that just ended
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateString = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    const newLogPath = path.join(logDir, `${dateString}.log`);
    const newErrorPath = path.join(errorDir, `${dateString}.log`);

    try {
        if (fs.existsSync(logPath)) fs.renameSync(logPath, newLogPath);
        if (fs.existsSync(errorPath)) fs.renameSync(errorPath, newErrorPath);
    } catch (e) {
        console.error(chalk.red('[LOGGER] Could not rollover log files:'), e);
    }

    // Schedule the next rollover
    scheduleMidnightRollover();
}

/**
 * Calculates the time until the next midnight and sets a timer to call rolloverLogs.
 */
function scheduleMidnightRollover() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    info(`[LOGGER] Next log rollover scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes.`);

    // Set the timer for the rollover
    setTimeout(rolloverLogs, msUntilMidnight);
}

// --- SHUTDOWN & CRASH HANDLING ---
/**
 * Renames the 'latest.log' files with a precise timestamp.
 * This is used for clean shutdowns and crashes.
 */
let isShuttingDown = false;

/**
 * The main shutdown handler. It archives logs and can be expanded for other cleanup tasks
 * (e.g., closing database connections).
 * @param {string} signal - The signal that triggered the shutdown.
 */
async function shutdown(signal) {
    // Prevent the function from running multiple times if signals are received in quick succession
    if (isShuttingDown) return;
    isShuttingDown = true;

    info(`[LOGGER] Signal received: ${signal}. Starting graceful shutdown.`);

    // --- Perform all cleanup tasks here ---
    console.log(chalk.yellow('[LOGGER] Archiving logs...'));
    archiveLogsOnExit();
    console.log(chalk.green('[LOGGER] Logs archived.'));

    // You could add other async cleanup tasks here, e.g.:
    // console.log(chalk.yellow('[DB] Closing database connection...'));
    // await database.close();
    // console.log(chalk.green('[DB] Database connection closed.'));

    console.log(chalk.cyan('[LOGGER] Shutdown complete. Exiting.'));
    process.exit(0);
}


/**
 * Renames the 'latest.log' files with a precise timestamp. This is a synchronous operation.
 */
function archiveLogsOnExit() {
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const archiveLogPath = path.join(logDir, `${timestamp}.log`);
    const archiveErrorPath = path.join(errorDir, `${timestamp}.log`);

    try {
        if (fs.existsSync(logPath)) fs.renameSync(logPath, archiveLogPath);
        if (fs.existsSync(errorPath)) fs.renameSync(errorPath, archiveErrorPath);
    } catch (e) {
        // This is a last-ditch effort to see an error during shutdown
        console.error(chalk.red('[LOGGER] CRITICAL: Could not archive logs during shutdown:'), e);
    }
}


// --- Process Signal Listeners ---

// Catches Ctrl+C
process.on('SIGINT', () => shutdown('SIGINT'));

// Catches "kill" signals (e.g., from Docker, PM2, or other process managers)
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catches uncaught exceptions (crashes)
process.on('uncaughtException', (err, origin) => {
    error('[CRASH] Uncaught Exception. The application will now terminate.');
    error(err);

    const crashLine = `[CRASH] Uncaught Exception at: ${origin}\n${err.stack || err}`;

    // Synchronously write crash info to the log before attempting to archive
    try {
        fs.appendFileSync(logPath, `${crashLine}\n`);
    } catch (e) {
        console.error(chalk.red('[LOGGER] CRITICAL: Could not write crash info to log file.'), e);
    }

    // Now, perform the standard log archiving
    archiveLogsOnExit();
    process.exit(1); // Exit with a non-zero code to indicate an error
});


// --- LOGGING UTILITIES & FUNCTIONS (Largely unchanged) ---

/**
 * A replacer function for JSON.stringify to handle circular structures.
 */
const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular Reference]';
            seen.add(value);
        }
        return value;
    };
};

function formatValue(val) {
    if (val instanceof Error) return val.stack || val.message;
    if (typeof val === 'object' && val !== null) {
        try {
            return JSON.stringify(val, getCircularReplacer(), 2);
        } catch {
            return '[Unserializable Object]';
        }
    }
    return String(val);
}

function logToFile(filepath, line) {
    // appendFileSync will create the file if it does not exist
    fs.appendFileSync(filepath, `[${new Date().toLocaleTimeString()}] ${line}\n`);
}

function info(...args) {
    const line = `[INFO] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (isVerbose) console.log(chalk.blue(line));
}

function success(...args) {
    const line = `[SUCCESS] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (isVerbose) console.log(chalk.green(line));
}

function warn(...args) {
    const line = `[WARN] ${args.map(formatValue).join(' ')}`;
    logToFile(logPath, line);
    if (!isQuiet) console.log(chalk.yellow(line));
}

function error(...args) {
    const line = `[ERROR] ${args.map(formatValue).join(' ')}`;
    console.log(chalk.red(line));
    logToFile(logPath, line);
    logToFile(errorPath, line);
}

function audit(...args) {
    const line = `[AUDIT] ${args.map(formatValue).join(' ')}`;
    if (isAudit || isVerbose) console.log(chalk.magenta(line));
}

function table(label, data) {
    if (isVerbose) {
        console.log(chalk.cyan(`📊 ${label}`));
        console.table(data);
    }
}

// Schedule the first rollover when the application starts
scheduleMidnightRollover();

module.exports = {
    info,
    success,
    warn,
    error,
    table,
    audit,
};