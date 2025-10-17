const db = require('@helpers/database');
const logger = require('@helpers/logger');

/**
 * Logs a moderation action to the database.
 * @param {string} guildId - The ID of the guild where the action occurred.
 * @param {string} moderatorId - The Discord ID of the moderator who took the action.
 * @param {string} targetId - The Discord ID of the user who was moderated.
 * @param {'kick' | 'ban' | 'timeout' | 'unban' | 'untimeout'} action - The type of moderation action.
 * @param {string} reason - The reason for the action.
 * @param {number | null} [durationSeconds=null] - The duration of the action in seconds (for timeouts/temp bans).
 * @returns {Promise<number|null>} The case ID of the new log entry, or null on failure.
 */
async function logAction(guildId, moderatorId, targetId, action, reason, durationSeconds = null) {
    try {
        const sql = `
            INSERT INTO moderation_logs (guild_id, moderator_id, target_id, action, reason, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const result = await db.query(sql, [guildId, moderatorId, targetId, action, reason, durationSeconds]);
        logger.info(`Moderation action logged. Case ID: ${result.insertId}`);
        return result.insertId;
    } catch (error) {
        logger.error('Failed to log moderation action to database:', error);
        return null;
    }
}

module.exports = {
    logAction,
};
