const { ActivityType } = require('discord.js');
const db = require('@helpers/database');
const logger = require('@helpers/logger');

// Store the timeout ID in a variable to manage it
let expiryTimeout = null;

/**
 * Sets the bot's presence and saves it to the database.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {string} activityTypeString The type of activity (e.g., 'Playing').
 * @param {string} statusText The text to display in the status.
 * @param {string|null} url The URL for streaming status.
 * @param {number|null} expiryTimestamp The Unix timestamp (in ms) when the status should expire, or null for never.
 */
async function setStatus(client, activityTypeString, statusText, url, expiryTimestamp) {
    try {
        const activityType = ActivityType[activityTypeString];
        const activityOptions = { type: activityType };
        if (url && activityType === ActivityType.Streaming) {
            activityOptions.url = url;
        }

        await client.user.setActivity(statusText, activityOptions);

        const sql = `
            INSERT INTO bot_status (id, activity, statusText, url, expiryTimestamp)
            VALUES (1, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                activity = VALUES(activity),
                statusText = VALUES(statusText),
                url = VALUES(url),
                expiryTimestamp = VALUES(expiryTimestamp)
        `;
        await db.query(sql, [activityTypeString, statusText, url, expiryTimestamp]);

        // Clear any existing scheduled expiry and set a new one if needed
        if (expiryTimeout) clearTimeout(expiryTimeout);
        if (expiryTimestamp) {
            scheduleExpiry(client, expiryTimestamp);
        }

        logger.success(`Bot status set to "${activityTypeString} ${statusText}" and saved to database.`);
    } catch (error) {
        logger.error('Failed to set bot status or save to DB:', error);
    }
}

/**
 * Clears the bot's presence and removes it from the database.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function clearStatus(client) {
    try {
        await client.user.setActivity(null);
        await db.query('DELETE FROM bot_status WHERE id = 1');
        if (expiryTimeout) {
            clearTimeout(expiryTimeout);
            expiryTimeout = null;
        }
        logger.success('Bot status cleared and removed from database.');
    } catch (error) {
        logger.error('Failed to clear bot status:', error);
    }
}

/**
 * Loads the status from the database on bot startup.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function loadStatus(client) {
    try {
        const rows = await db.query('SELECT * FROM bot_status WHERE id = 1');
        if (rows.length === 0) return;

        const savedStatus = rows[0];
        const { activity, statusText, url, expiryTimestamp } = savedStatus;

        if (expiryTimestamp && Date.now() >= expiryTimestamp) {
            logger.info('Saved status has expired. Clearing it.');
            await clearStatus(client);
            return;
        }

        const activityType = ActivityType[activity];
        if (!activityType) {
            logger.warn(`Invalid activity type "${activity}" found in database. Clearing status.`);
            await clearStatus(client);
            return;
        }

        const activityOptions = { type: activityType };
        if (url && activityType === ActivityType.Streaming) {
            activityOptions.url = url;
        }

        await client.user.setActivity(statusText, activityOptions);
        logger.success(`Restored saved status: "${activity} ${statusText}"`);

        if (expiryTimestamp) {
            scheduleExpiry(client, expiryTimestamp);
        }

    } catch (error) {
        logger.error('Failed to load bot status from DB:', error);
    }
}

/**
 * Schedules a timeout to clear the status when it expires.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {number} expiryTimestamp The Unix timestamp (in ms) for expiry.
 */
function scheduleExpiry(client, expiryTimestamp) {
    const delay = expiryTimestamp - Date.now();
    if (delay <= 0) return; // Already expired

    expiryTimeout = setTimeout(() => {
        logger.info('Scheduled status has expired. Clearing...');
        clearStatus(client);
    }, delay);

    logger.info(`Status expiry check scheduled for ${new Date(expiryTimestamp).toLocaleString()}`);
}


module.exports = {
    setStatus,
    clearStatus,
    loadStatus,
};
