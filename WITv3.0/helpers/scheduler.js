const logger = require('@helpers/logger');
// Dynamically import the command file to avoid circular dependencies
const { runCommanderListUpdate } = require('../commands/utility/commanderlist');
const authManager = require('@helpers/authManager'); // For ESI token refresh
const walletMonitor = require('@helpers/walletMonitor'); // Import the wallet monitor

const MONDAY_UTC = 1; // 1 for Monday
const HOUR_UTC = 1;   // 1 AM
const TOKEN_REFRESH_INTERVAL_DAYS = 7; // Refresh ESI tokens every 7 days
const WALLET_SYNC_INTERVAL_MINUTES = 10; // Sync wallet transactions every 10 minutes

let commanderListTimeout = null;
let tokenRefreshTimeout = null;
let walletSyncInterval = null; // Use Interval for wallet sync

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
 * Initializes and schedules the periodic wallet transaction synchronization.
 * @param {import('discord.js').Client} client
 */
function scheduleWalletSync(client) {
    if (walletSyncInterval) clearInterval(walletSyncInterval); // Clear existing interval if any

    const syncIntervalMs = WALLET_SYNC_INTERVAL_MINUTES * 60 * 1000;

    // Run immediately on startup, then schedule interval
    logger.info(`[Scheduler] Running initial wallet sync...`);
    walletMonitor.syncWalletTransactions().catch(error => {
        logger.error('[Scheduler] Error during initial wallet sync:', error);
    });

    walletSyncInterval = setInterval(async () => {
        logger.info(`[Scheduler] Running scheduled wallet sync (every ${WALLET_SYNC_INTERVAL_MINUTES} mins)...`);
        try {
            await walletMonitor.syncWalletTransactions();
        } catch (error) {
            logger.error('[Scheduler] Error during scheduled wallet sync:', error);
        }
    }, syncIntervalMs);

    logger.info(`[Scheduler] Wallet transaction sync scheduled every ${WALLET_SYNC_INTERVAL_MINUTES} minutes.`);
}

/**
 * Initializes all scheduled tasks for the bot.
 * @param {import('discord.js').Client} client
 */
async function initialize(client) {
    logger.info('[Scheduler] Initializing scheduled tasks...');

    // Initialize wallet monitor cache first
    await walletMonitor.initializeLastTransactionIds();

    // Then schedule the tasks
    scheduleNextMondayUpdate(client);
    scheduleTokenRefresh(client);
    scheduleWalletSync(client); // Add the wallet sync task
}

module.exports = {
    initialize,
};
