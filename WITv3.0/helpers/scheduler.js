const logger = require('@helpers/logger');
const authManager = require('@helpers/authManager'); // For ESI token refresh
// No require for walletMonitor at the top level

const MONDAY_UTC = 1; // 1 for Monday
const HOUR_UTC = 1;   // 1 AM UTC
const TOKEN_REFRESH_INTERVAL_DAYS = 7; // Refresh ESI tokens every 7 days

let commanderListTimeout = null;
let tokenRefreshTimeout = null;
let walletSyncTimeout = null;
let nextWalletSyncTimestamp = null; // Variable to store the next sync timestamp

/**
 * Schedules the next weekly update for the commander list.
 * @param {import('discord.js').Client} client
 */
function scheduleNextMondayUpdate(client) {
    if (commanderListTimeout) clearTimeout(commanderListTimeout);

    const now = new Date();
    // ... (rest of the date calculation logic remains the same) ...
    const nowUTC = {
        day: now.getUTCDay(),
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes()
    };
    let daysUntilMonday = MONDAY_UTC - nowUTC.day;
    if (daysUntilMonday < 0 || (daysUntilMonday === 0 && (nowUTC.hour > HOUR_UTC || (nowUTC.hour === HOUR_UTC && nowUTC.minute >= 0)))) {
        daysUntilMonday += 7;
    }
    const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, HOUR_UTC, 0, 0, 0));
    const delay = nextRun.getTime() - now.getTime();


    logger.info(`[Scheduler] Next commander list refresh scheduled for ${nextRun.toUTCString()} (in ${Math.round(delay / 1000 / 60)} minutes).`);

    commanderListTimeout = setTimeout(async () => {
        logger.info('[Scheduler] Running scheduled commander list update...');
        const { runCommanderListUpdate } = require('../commands/utility/commanderlist');
        try {
            const { success, changes } = await runCommanderListUpdate(client);
            // ... (logging remains the same) ...
            if (success) {
                logger.success(`[Scheduler] Scheduled commander list update complete. Found ${changes.size} roles with changes.`);
            } else {
                logger.error('[Scheduler] Scheduled commander list update failed.');
            }
        } catch (error) {
            logger.error('[Scheduler] Error during scheduled commander list update:', error);
        } finally {
            scheduleNextMondayUpdate(client);
        }
    }, delay);
}

/**
 * Schedules a periodic refresh of all ESI authentication tokens.
 * @param {import('discord.js').Client} client
 */
function scheduleTokenRefresh(client) {
    if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);

    const now = new Date();
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
            scheduleTokenRefresh(client);
        }
    }, delay);
}

/**
 * Executes the wallet sync and schedules the next run based on the returned delay.
 * @param {import('discord.js').Client} client
 */
async function runWalletSyncNow(client) {
    if (walletSyncTimeout) clearTimeout(walletSyncTimeout);
    nextWalletSyncTimestamp = null; // Reset timestamp before starting

    // Require walletMonitor right before using its function
    const walletMonitor = require('@helpers/walletMonitor');
    let nextDelay = 15 * 60 * 1000; // Default to 15 mins if sync fails badly

    try {
        // Check if the function exists before calling - crucial guard
        if (typeof walletMonitor.syncWalletTransactions === 'function') {
            nextDelay = await walletMonitor.syncWalletTransactions();
        } else {
            logger.error('[Scheduler] CRITICAL: walletMonitor.syncWalletTransactions is not a function when called!');
            throw new Error('syncWalletTransactions function not found in walletMonitor module.');
        }
    } catch (error) {
        logger.error('[Scheduler] Uncaught error during wallet sync execution:', error);
    } finally {
        scheduleNextWalletSync(client, nextDelay);
    }
}

/**
 * Schedules the next wallet sync using setTimeout.
 * @param {import('discord.js').Client} client
 * @param {number} delayMs - Delay in milliseconds.
 */
function scheduleNextWalletSync(client, delayMs) {
    if (walletSyncTimeout) clearTimeout(walletSyncTimeout);

    const safeDelay = Math.max(10000, delayMs); // Min 10 seconds
    const nextRunTime = new Date(Date.now() + safeDelay);
    nextWalletSyncTimestamp = nextRunTime.getTime(); // Store the next run time

    logger.info(`[Scheduler] Next wallet sync scheduled for ${nextRunTime.toLocaleTimeString()} (in ${Math.round(safeDelay / 1000)}s).`);

    walletSyncTimeout = setTimeout(() => runWalletSyncNow(client), safeDelay);
}


/**
 * Initializes all scheduled tasks for the bot.
 * Wallet cache initialization is now handled in clientReady.
 * @param {import('discord.js').Client} client
 */
async function initialize(client) {
    logger.info('[Scheduler] Initializing scheduled tasks (excluding wallet cache)...');

    // Schedule other tasks
    scheduleNextMondayUpdate(client);
    scheduleTokenRefresh(client);

    // Run the wallet sync immediately *after* initialization phase completes
    // The cache should be initialized by clientReady *before* this runs
    logger.info('[Scheduler] Running initial wallet sync...');
    runWalletSyncNow(client).catch(error => {
        logger.error('[Scheduler] Error during initial wallet sync execution:', error);
        scheduleNextWalletSync(client, 5 * 60 * 1000); // Retry in 5 mins
    });
}

/**
 * Gets the timestamp for the next scheduled wallet sync.
 * @returns {number|null} Timestamp in milliseconds or null if not scheduled.
 */
function getNextWalletSyncTime() {
    // Defensive check to prevent ReferenceError, though it shouldn't be needed.
    if (typeof nextWalletSyncTimestamp === 'undefined') {
        logger.error("[Scheduler] CRITICAL: nextWalletSyncTimestamp variable is undefined when getNextWalletSyncTime() is called!");
        return null; // Return null instead of throwing
    }
    return nextWalletSyncTimestamp;
}

module.exports = {
    initialize,
    scheduleNextWalletSync,
    getNextWalletSyncTime // Export the new function
};
