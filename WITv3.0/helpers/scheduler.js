const logger = require('@helpers/logger');
// We need to dynamically import the command file to avoid circular dependencies
// if the command ever needs to import the scheduler in the future.
const { runCommanderListUpdate } = require('../commands/utility/commanderlist');
const authManager = require('@helpers/authManager'); // Import the authManager

const MONDAY_UTC = 1; // 1 for Monday
const HOUR_UTC = 1;   // 1 AM
const TOKEN_REFRESH_INTERVAL_DAYS = 7; // Refresh tokens every 7 days

/**
 * Schedules the next weekly update for the commander list.
 * @param {import('discord.js').Client} client
 */
function scheduleNextMondayUpdate(client) {
    const now = new Date();
    const nowUTC = {
        day: now.getUTCDay(),
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes()
    };

    let daysUntilMonday = MONDAY_UTC - nowUTC.day;
    if (daysUntilMonday < 0 || (daysUntilMonday === 0 && (nowUTC.hour > HOUR_UTC || (nowUTC.hour === HOUR_UTC && nowUTC.minute > 0)))) {
        // If it's already past Monday 1 AM this week, schedule for next week.
        daysUntilMonday += 7;
    }

    const nextRun = new Date(now);
    nextRun.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextRun.setUTCHours(HOUR_UTC, 0, 0, 0);

    const delay = nextRun.getTime() - now.getTime();

    logger.info(`[Scheduler] Next commander list refresh scheduled for ${nextRun.toUTCString()} (in ${Math.round(delay / 1000 / 60)} minutes).`);

    setTimeout(async () => {
        logger.info('[Scheduler] Running scheduled commander list update...');
        const { success, changes } = await runCommanderListUpdate(client);
        if (success) {
            logger.success(`[Scheduler] Scheduled commander list update complete. Found ${changes.size} roles with changes.`);
        } else {
            logger.error('[Scheduler] Scheduled commander list update failed.');
        }

        // Schedule the next run for the following week.
        scheduleNextMondayUpdate(client);
    }, delay);
}

/**
 * Schedules a periodic refresh of all ESI authentication tokens.
 * @param {import('discord.js').Client} client 
 */
function scheduleTokenRefresh(client) {
    const now = new Date();
    const delay = TOKEN_REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    const nextRun = new Date(now.getTime() + delay);

    logger.info(`[Scheduler] Next ESI token refresh scheduled for ${nextRun.toUTCString()} (in ~${TOKEN_REFRESH_INTERVAL_DAYS} days).`);

    setTimeout(async () => {
        logger.info('[Scheduler] Running scheduled ESI token refresh...');
        await authManager.refreshAllTokens();

        // Schedule the next run
        scheduleTokenRefresh(client);
    }, delay);
}


/**
 * Initializes all scheduled tasks for the bot.
 * @param {import('discord.js').Client} client
 */
function initialize(client) {
    logger.info('[Scheduler] Initializing scheduled tasks...');
    scheduleNextMondayUpdate(client);
    scheduleTokenRefresh(client); // Add the token refresh to the schedule
}

module.exports = {
    initialize,
};

