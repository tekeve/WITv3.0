const db = require('@helpers/database');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

/**
 * Adds an ISK log entry to the database.
 * @param {object} logData - The data for the log entry.
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
        const timeWindow = 60 * 1000; // 60 seconds
        const startTime = new Date(fleetTimestamp.getTime() - timeWindow);
        const endTime = new Date(fleetTimestamp.getTime() + timeWindow);

        const checkSql = 'SELECT log_id FROM isk_logs WHERE discord_id = ? AND fleet_timestamp BETWEEN ? AND ?';
        const existingLog = await db.query(checkSql, [discordId, startTime, endTime]);

        if (existingLog && existingLog.length > 0) {
            logger.warn(`Duplicate fleet log submission prevented for commander ${commanderName} (${discordId}) at timestamp ${fleetTimestamp.toISOString()}`);
            return { success: false, message: 'A fleet log from this commander around this time has already been submitted. This is likely a duplicate.' };
        }
        // --- DUPLICATE CHECK END ---

        const sql = `
            INSERT INTO isk_logs (discord_id, commander_name, fleet_timestamp, duration_minutes, total_isk, isk_per_hour, pilot_count, sites_run, journal_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(sql, [
            discordId, commanderName, fleetTimestamp,
            durationMinutes || null, totalIsk || null, iskPerHour || null,
            pilotCount || null, sitesRun || null, journalData || null
        ]);
        logger.success(`ISK log saved for commander ${commanderName} (${discordId}).`);
        return { success: true, message: 'Log submitted successfully.' };
    } catch (error) {
        logger.error('Failed to save ISK log to database:', error);
        return { success: false, message: 'A database error occurred while saving the log.' };
    }
}

/**
 * Deletes a log entry from the database after verifying permissions.
 * @param {number} logId - The ID of the log to delete.
 * @param {import('discord.js').GuildMember} member - The member requesting the deletion.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function deleteLog(logId, member) {
    try {
        const logEntryRows = await db.query('SELECT discord_id FROM isk_logs WHERE log_id = ?', [logId]);

        if (!logEntryRows || logEntryRows.length === 0) {
            return { success: false, message: 'Log entry not found.' };
        }
        const logEntry = logEntryRows[0];

        const isOwner = logEntry.discord_id === member.id;
        const isLeadership = roleManager.isLeadershipOrHigher(member);

        if (!isOwner && !isLeadership) {
            return { success: false, message: 'You do not have permission to delete this log entry.' };
        }

        const result = await db.query('DELETE FROM isk_logs WHERE log_id = ?', [logId]);

        if (result.affectedRows > 0) {
            logger.info(`Log entry ${logId} deleted by ${member.user.tag}.`);
            return { success: true, message: 'Log entry successfully deleted.' };
        } else {
            return { success: false, message: 'Log entry could not be deleted.' };
        }
    } catch (error) {
        logger.error(`Failed to delete log entry ${logId}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

/**
 * Fetches aggregated statistics from the isk_logs table.
 * @returns {Promise<{success: boolean, data?: object, message?: string}>}
 */
async function getStats() {
    try {
        const singleBoxThreshold = 1.6;

        const overallStatsQuery = `
            SELECT
                COUNT(*) as totalFleets,
                SUM(total_isk) as totalIsk,
                AVG(isk_per_hour) as averageIskPerHour,
                SUM(duration_minutes) as totalDurationMinutes,
                SUM(sites_run) as totalSitesRun
            FROM isk_logs;`;

        const topSingleBoxByIskPerHourQuery = `
            SELECT commander_name, AVG(isk_per_hour) as avgIskPerHour, COUNT(*) as fleetCount
            FROM isk_logs
            WHERE pilot_count < ?
            GROUP BY commander_name HAVING fleetCount > 0
            ORDER BY avgIskPerHour DESC LIMIT 5;`;

        const topSingleBoxByTotalIskQuery = `
            SELECT commander_name, SUM(total_isk) as totalIsk, COUNT(*) as fleetCount
            FROM isk_logs
            WHERE pilot_count < ?
            GROUP BY commander_name
            ORDER BY totalIsk DESC LIMIT 5;`;

        const topMultiBoxByIskPerHourQuery = `
            SELECT commander_name, AVG(isk_per_hour) as avgFleetIskPerHour, AVG(pilot_count) as avgPilots, COUNT(*) as fleetCount
            FROM isk_logs
            WHERE pilot_count >= ?
            GROUP BY commander_name HAVING fleetCount > 0
            ORDER BY avgFleetIskPerHour DESC LIMIT 5;`;

        const topMultiBoxByTotalIskQuery = `
            SELECT commander_name, SUM(total_isk) as totalIsk, AVG(pilot_count) as avgPilots, COUNT(*) as fleetCount
            FROM isk_logs
            WHERE pilot_count >= ?
            GROUP BY commander_name
            ORDER BY totalIsk DESC LIMIT 5;`;

        const top5CommandersQuery = `
            SELECT commander_name
            FROM isk_logs
            GROUP BY commander_name
            ORDER BY SUM(total_isk) DESC
            LIMIT 5;`;

        const [
            overallStatsResult,
            topSingleBoxByIskPerHourResult,
            topSingleBoxByTotalIskResult,
            topMultiBoxByIskPerHourResult,
            topMultiBoxByTotalIskResult,
            top5CommandersResult
        ] = await Promise.all([
            db.query(overallStatsQuery),
            db.query(topSingleBoxByIskPerHourQuery, [singleBoxThreshold]),
            db.query(topSingleBoxByTotalIskQuery, [singleBoxThreshold]),
            db.query(topMultiBoxByIskPerHourQuery, [singleBoxThreshold]),
            db.query(topMultiBoxByTotalIskQuery, [singleBoxThreshold]),
            db.query(top5CommandersQuery)
        ]);

        const overallStats = (overallStatsResult && overallStatsResult[0]) ? overallStatsResult[0] : {};
        const top5CommanderNames = Array.isArray(top5CommandersResult) ? top5CommandersResult.map(c => c.commander_name) : [];

        let iskOverTime = [];
        if (top5CommanderNames.length > 0) {
            const placeholders = top5CommanderNames.map(() => '?').join(',');
            const iskOverTimeQuery = `
                SELECT
                    commander_name,
                    DATE(fleet_timestamp) as date,
                    AVG(total_isk / pilot_count / (duration_minutes / 60)) as avgPilotIskPerHour
                FROM isk_logs
                WHERE commander_name IN (${placeholders}) AND duration_minutes > 0 AND pilot_count > 0
                GROUP BY commander_name, DATE(fleet_timestamp)
                ORDER BY date ASC;`;
            iskOverTime = await db.query(iskOverTimeQuery, top5CommanderNames);
        }

        return {
            success: true,
            data: {
                overallStats,
                topCommandersByIskPerHourSingleBox: topSingleBoxByIskPerHourResult,
                topCommandersByTotalIskSingleBox: topSingleBoxByTotalIskResult,
                topMultiBoxByIskPerHour: topMultiBoxByIskPerHourResult,
                topCommandersByTotalIskMultiBox: topMultiBoxByTotalIskResult,
                iskOverTime
            }
        };
    } catch (error) {
        logger.error('Failed to get ISK log stats from database:', error);
        return { success: false, message: 'A database error occurred while fetching stats.' };
    }
}


/**
 * Fetches a paginated list of recent fleet logs.
 * @param {number} page - The page number to fetch.
 * @param {number} limit - The number of items per page.
 * @returns {Promise<object>}
 */
async function getPaginatedFleets(page = 1, limit = 15) {
    try {
        const numLimit = Number(limit);
        const numPage = Number(page);
        const offset = (numPage - 1) * numLimit;

        const countResult = await db.query('SELECT COUNT(*) as total FROM isk_logs;');
        const totalFleets = countResult[0] ? countResult[0].total : 0;

        const fleets = await db.query(`
            SELECT
                log_id, discord_id, commander_name, fleet_timestamp, duration_minutes,
                total_isk, isk_per_hour, pilot_count, sites_run
            FROM isk_logs
            ORDER BY fleet_timestamp DESC
            LIMIT ${offset}, ${numLimit};
        `);

        return {
            success: true,
            data: {
                fleets,
                totalFleets,
                totalPages: Math.ceil(totalFleets / numLimit),
                currentPage: numPage,
            },
        };
    } catch (error) {
        logger.error('Failed to get paginated fleet data from database:', error);
        return { success: false, message: 'A database error occurred while fetching fleet logs.' };
    }
}


module.exports = {
    addLog,
    deleteLog,
    getStats,
    getPaginatedFleets,
};
