const db = require('@helpers/database');
const logger = require('@helpers/logger');

/**
 * Adds an ISK log entry to the database.
 * @param {object} logData - The data for the log entry.
 * @param {string} logData.discordId
 * @param {string} logData.commanderName
 * @param {Date} logData.fleetTimestamp
 * @param {number} logData.durationMinutes
 * @param {number} logData.totalIsk
 * @param {number} logData.iskPerHour
 * @param {number} logData.pilotCount
 * @param {number} logData.sitesRun
 * @param {string} logData.journalData
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addLog(logData) {
    const {
        discordId,
        commanderName,
        fleetTimestamp,
        durationMinutes,
        totalIsk,
        iskPerHour,
        pilotCount,
        sitesRun,
        journalData,
    } = logData;

    if (!discordId || !fleetTimestamp || !commanderName) {
        return { success: false, message: 'Missing required data for logging.' };
    }

    try {
        const sql = `
            INSERT INTO isk_logs (discord_id, commander_name, fleet_timestamp, duration_minutes, total_isk, isk_per_hour, pilot_count, sites_run, journal_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(sql, [discordId, commanderName, fleetTimestamp, durationMinutes, totalIsk, iskPerHour, pilotCount, sitesRun, journalData]);
        logger.success(`ISK log saved for commander ${commanderName} (${discordId}).`);
        return { success: true, message: 'Log submitted successfully.' };
    } catch (error) {
        logger.error('Failed to save ISK log to database:', error);
        return { success: false, message: 'A database error occurred while saving the log.' };
    }
}

module.exports = {
    addLog,
};
