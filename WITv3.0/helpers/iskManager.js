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
        // --- DUPLICATE CHECK START ---
        // Check if a log from the same commander exists +/- 60 seconds from the fleet start time.
        const timeWindow = 60 * 1000; // 60 seconds in milliseconds
        const startTime = new Date(fleetTimestamp.getTime() - timeWindow);
        const endTime = new Date(fleetTimestamp.getTime() + timeWindow);

        const checkSql = 'SELECT log_id FROM isk_logs WHERE discord_id = ? AND fleet_timestamp BETWEEN ? AND ?';
        const [existingLog] = await db.query(checkSql, [discordId, startTime, endTime]);

        if (existingLog) {
            logger.warn(`Duplicate fleet log submission prevented for commander ${commanderName} (${discordId}) at timestamp ${fleetTimestamp.toISOString()}`);
            return { success: false, message: 'A fleet log from this commander around this time has already been submitted. This is likely a duplicate.' };
        }
        // --- DUPLICATE CHECK END ---

        const sql = `
            INSERT INTO isk_logs (discord_id, commander_name, fleet_timestamp, duration_minutes, total_isk, isk_per_hour, pilot_count, sites_run, journal_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        // Ensure any undefined numeric values are converted to null
        await db.query(sql, [
            discordId,
            commanderName,
            fleetTimestamp,
            durationMinutes || null,
            totalIsk || null,
            iskPerHour || null,
            pilotCount || null,
            sitesRun || null,
            journalData || null
        ]);
        logger.success(`ISK log saved for commander ${commanderName} (${discordId}).`);
        return { success: true, message: 'Log submitted successfully.' };
    } catch (error) {
        logger.error('Failed to save ISK log to database:', error);
        return { success: false, message: 'A database error occurred while saving the log.' };
    }
}

/**
 * Fetches aggregated statistics from the isk_logs table.
 * @returns {Promise<object>} An object containing various fleet statistics.
 */
async function getStats() {
    try {
        const overallStatsQuery = `
            SELECT
                COUNT(*) as totalFleets,
                SUM(total_isk) as totalIsk,
                AVG(isk_per_hour) as averageIskPerHour,
                SUM(duration_minutes) as totalDurationMinutes,
                SUM(sites_run) as totalSitesRun
            FROM isk_logs;
        `;

        const topCommandersByIskPerHourQuery = `
            SELECT
                commander_name,
                AVG(isk_per_hour) as avgIskPerHour,
                COUNT(*) as fleetCount
            FROM isk_logs
            GROUP BY commander_name
            ORDER BY avgIskPerHour DESC
            LIMIT 10;
        `;

        const topCommandersByTotalIskQuery = `
            SELECT
                commander_name,
                SUM(total_isk) as totalIsk,
                COUNT(*) as fleetCount
            FROM isk_logs
            GROUP BY commander_name
            ORDER BY totalIsk DESC
            LIMIT 10;
        `;

        const recentFleetsQuery = `
            SELECT
                commander_name,
                fleet_timestamp,
                duration_minutes,
                total_isk,
                isk_per_hour,
                pilot_count,
                sites_run
            FROM isk_logs
            ORDER BY fleet_timestamp DESC
            LIMIT 15;
        `;

        const iskOverTimeQuery = `
            SELECT
                DATE(fleet_timestamp) as date,
                AVG(isk_per_hour) as avgIskPerHour
            FROM isk_logs
            GROUP BY DATE(fleet_timestamp)
            ORDER BY date ASC;
        `;

        const [
            [overallStats],
            topCommandersByIskPerHour,
            topCommandersByTotalIsk,
            recentFleets,
            iskOverTime
        ] = await Promise.all([
            db.query(overallStatsQuery),
            db.query(topCommandersByIskPerHourQuery),
            db.query(topCommandersByTotalIskQuery),
            db.query(recentFleetsQuery),
            db.query(iskOverTimeQuery)
        ]);

        return {
            success: true,
            data: {
                overallStats,
                topCommandersByIskPerHour,
                topCommandersByTotalIsk,
                recentFleets,
                iskOverTime
            }
        };

    } catch (error) {
        logger.error('Failed to get ISK log stats from database:', error);
        return { success: false, message: 'A database error occurred while fetching stats.' };
    }
}

module.exports = {
    addLog,
    getStats,
};

