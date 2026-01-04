const logger = require('@helpers/logger');
// Dynamically import the command file to avoid circular dependencies if needed elsewhere
// const { runCommanderListUpdate } = require('../commands/utility/commanderlist');
const authManager = require('@helpers/authManager'); // For ESI token refresh
// REMOVED walletMonitor import from the top level

const MONDAY_UTC = 1; // 1 for Monday
const HOUR_UTC = 1;   // 1 AM UTC
const TOKEN_REFRESH_INTERVAL_DAYS = 7; // Refresh ESI tokens every 7 days

let commanderListTimeout = null;
let tokenRefreshTimeout = null;
let walletSyncTimeout = null; // Changed from interval to timeout

/**
 * Schedules the next weekly update for the commander list.
 * @param {import('discord.js').Client} client
 */
function scheduleNextMondayUpdate(client) {
    if (commanderListTimeout) clearTimeout(commanderListTimeout); // Clear previous timeout if exists

    const now = new Date();
    const nowUTC = {
        day: now.getUTCDay(),
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes()
    };

    let daysUntilMonday = MONDAY_UTC - nowUTC.day;
    // If it's already past Monday 1 AM this week, schedule for next week.
    if (daysUntilMonday < 0 || (daysUntilMonday === 0 && (nowUTC.hour > HOUR_UTC || (nowUTC.hour === HOUR_UTC && nowUTC.minute >= 0)))) {
        daysUntilMonday += 7;
    }

    const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, HOUR_UTC, 0, 0, 0));

    const delay = nextRun.getTime() - now.getTime();

    logger.info(`[Scheduler] Next commander list refresh scheduled for ${nextRun.toUTCString()} (in ${Math.round(delay / 1000 / 60)} minutes).`);

    commanderListTimeout = setTimeout(async () => {
        logger.info('[Scheduler] Running scheduled commander list update...');
        // Dynamically require here if needed, or ensure it's loaded elsewhere
        const { runCommanderListUpdate } = require('../commands/utility/commanderlist');
        try {
            const { success, changes } = await runCommanderListUpdate(client);
            if (success) {
                logger.success(`[Scheduler] Scheduled commander list update complete. Found ${changes.size} roles with changes.`);
            } else {
                logger.error('[Scheduler] Scheduled commander list update failed.');
            }
        } catch (error) {
            logger.error('[Scheduler] Error during scheduled commander list update:', error);
        } finally {
            // Schedule the next run regardless of success/failure
            scheduleNextMondayUpdate(client);
        }
    }, delay);
}

/**
 * Schedules a periodic refresh of all ESI authentication tokens.
 * @param {import('discord.js').Client} client
 */
function scheduleTokenRefresh(client) {
    if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout); // Clear previous timeout

    const now = new Date();
    // Calculate delay in milliseconds
    const delay = TOKEN_REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    const nextRun = new Date(now.getTime() + delay);

    logger.info(`[Scheduler] Next ESI token refresh scheduled for ${nextRun.toUTCString()} (in ~${TOKEN_REFRESH_INTERVAL_DAYS} days).`);

    tokenRefreshTimeout = setTimeout(async () => {
        logger.info('[Scheduler] Running scheduled ESI token refresh...');
        try {
            await authManager.refreshAllTokens();
        } catch (error) {
            logger.error('[Scheduler] Error during scheduled token refresh:', error);
        } finally {
            // Schedule the next run
            scheduleTokenRefresh(client);
        }
    }, delay);
}

/**
 * Executes the wallet sync and schedules the next run based on the returned delay.
 * @param {import('discord.js').Client} client
 */
async function runWalletSyncNow(client) {
    if (walletSyncTimeout) clearTimeout(walletSyncTimeout); // Clear any pending timeout

    // Require syncWalletTransactions right before using it
    const walletMonitor = require('@helpers/walletMonitor'); // Require the full module here
    let nextDelay = 15 * 60 * 1000; // Default to 15 mins if sync fails badly

    try {
        // Run the sync and get the delay for the next run
        // Check if the function exists before calling
        if (typeof walletMonitor.syncWalletTransactions === 'function') {
            nextDelay = await walletMonitor.syncWalletTransactions();
        } else {
            logger.error('[Scheduler] CRITICAL: walletMonitor.syncWalletTransactions is not available!');
            throw new Error('syncWalletTransactions function not found in walletMonitor module.'); // Throw error to trigger retry scheduling
        }
    } catch (error) {
        // Catch critical errors during the sync itself (e.g., DB connection issue)
        logger.error('[Scheduler] Uncaught error during wallet sync execution:', error);
    } finally {
        // Always schedule the next run
        scheduleNextWalletSync(client, nextDelay);
    }
}

/**
 * Schedules the next wallet sync using setTimeout.
 * @param {import('discord.js').Client} client
 * @param {number} delayMs - Delay in milliseconds.
 */
function scheduleNextWalletSync(client, delayMs) {
    if (walletSyncTimeout) clearTimeout(walletSyncTimeout); // Clear previous timeout

    const safeDelay = Math.max(10000, delayMs); // Ensure minimum 10 seconds delay
    const nextRunTime = new Date(Date.now() + safeDelay);

    logger.info(`[Scheduler] Next wallet sync scheduled for ${nextRunTime.toLocaleTimeString()} (in ${Math.round(safeDelay / 1000)}s).`);

    walletSyncTimeout = setTimeout(() => runWalletSyncNow(client), safeDelay);
}


/**
 * Initializes all scheduled tasks for the bot.
 * Now marked as async.
 * @param {import('discord.js').Client} client
 */
async function initialize(client) {
    logger.info('[Scheduler] Initializing scheduled tasks...');

    // Require walletMonitor *inside* initialize, right before use
    const walletMonitor = require('@helpers/walletMonitor');

    // Await the wallet cache initialization *before* proceeding
    try {
        // Check if the function exists before calling
        if (typeof walletMonitor.initializeLastTransactionIds === 'function') {
            await walletMonitor.initializeLastTransactionIds();
            logger.success('[Scheduler] Wallet transaction ID cache initialized.');
        } else {
            logger.error('[Scheduler] CRITICAL: walletMonitor.initializeLastTransactionIds is not available during init!');
            throw new Error('initializeLastTransactionIds function not found in walletMonitor module during init.'); // Throw to indicate critical failure
        }
    } catch (error) {
        // Log critical failure, but proceed with other tasks
        logger.error('[Scheduler] CRITICAL: Failed to initialize wallet transaction ID cache!', error);
    }

    // Schedule other tasks
    scheduleNextMondayUpdate(client);
    scheduleTokenRefresh(client);

    // Run the wallet sync immediately after initialization, which will then schedule its next run
    logger.info('[Scheduler] Running initial wallet sync...');
    // Run async but don't block the rest of the bot startup
    runWalletSyncNow(client).catch(error => {
        logger.error('[Scheduler] Error during initial wallet sync execution:', error);
        // Still schedule a retry even if the initial run fails immediately
        scheduleNextWalletSync(client, 5 * 60 * 1000); // Retry in 5 mins
    });

}

module.exports = {
    initialize,
    scheduleNextWalletSync, // Export this so walletMonitor can call it (if needed)
};

