const db = require('@helpers/database');
const logger = require('@helpers/logger');
const { EmbedBuilder } = require('discord.js');

// Store timeouts in a map so they can be cancelled if a reminder is deleted
const activeReminders = new Map();

/**
 * Deletes a specific reminder from the database.
 * @param {number} reminderId The ID of the reminder to delete.
 * @param {string} [discordId] The Discord ID of the user requesting deletion for ownership validation. If null, ownership is not checked.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function deleteReminder(reminderId, discordId) {
    const sql = discordId ? 'DELETE FROM reminders WHERE id = ? AND discord_id = ?' : 'DELETE FROM reminders WHERE id = ?';
    const params = discordId ? [reminderId, discordId] : [reminderId];
    const result = await db.query(sql, params);

    // Also clear any scheduled timeout
    if (activeReminders.has(reminderId)) {
        clearTimeout(activeReminders.get(reminderId));
        activeReminders.delete(reminderId);
    }

    return result.affectedRows > 0;
}

/**
 * Schedules a single reminder to be sent at the correct time.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} reminder The reminder object from the database.
 */
function scheduleReminder(client, reminder) {
    const delay = reminder.remind_at - Date.now();

    // If the reminder time has already passed, log it and delete it.
    if (delay <= 0) {
        logger.warn(`Reminder ${reminder.id} for user ${reminder.discord_id} was in the past. Deleting.`);
        deleteReminder(reminder.id, null); // No need to check ownership
        return;
    }

    const timeout = setTimeout(async () => {
        try {
            const reminderEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(reminder.reminder_text)
                .setTimestamp(reminder.remind_at);

            if (reminder.is_ephemeral) {
                const user = await client.users.fetch(reminder.discord_id);
                await user.send({
                    content: `Here is your reminder:`,
                    embeds: [reminderEmbed]
                });
            } else {
                const channel = await client.channels.fetch(reminder.channel_id);
                if (channel) {
                    await channel.send({
                        content: `<@${reminder.discord_id}>, here's your reminder:`,
                        embeds: [reminderEmbed]
                    });
                }
            }
            // Once sent, delete it from the database and the active reminders map
            await deleteReminder(reminder.id, null);
        } catch (error) {
            logger.error(`Failed to send reminder ${reminder.id} for user ${reminder.discord_id}:`, error);
            // Delete it even if sending fails to avoid re-sending on restart
            await deleteReminder(reminder.id, null);
        } finally {
            activeReminders.delete(reminder.id);
        }
    }, delay);

    activeReminders.set(reminder.id, timeout);
}

/**
 * Adds a reminder to the database.
 * @param {string} discordId The user's Discord ID.
 * @param {string} channelId The ID of the channel where the command was used.
 * @param {number} remindAt The timestamp (ms) to send the reminder.
 * @param {string} reminderText The text of the reminder.
 * @param {boolean} isEphemeral Whether the reminder should be a DM.
 * @returns {Promise<object>} The newly created reminder object.
 */
async function addReminder(discordId, channelId, remindAt, reminderText, isEphemeral) {
    const sql = 'INSERT INTO reminders (discord_id, channel_id, remind_at, reminder_text, is_ephemeral) VALUES (?, ?, ?, ?, ?)';
    const result = await db.query(sql, [discordId, channelId, remindAt, reminderText, isEphemeral]);
    return {
        id: result.insertId,
        discord_id: discordId,
        channel_id: channelId,
        remind_at: remindAt,
        reminder_text: reminderText,
        is_ephemeral: isEphemeral,
    };
}

/**
 * Deletes all reminders for a specific user.
 * @param {string} discordId The Discord ID of the user.
 * @returns {Promise<number>} The number of reminders deleted.
 */
async function deleteAllReminders(discordId) {
    const userReminders = await getReminders(discordId);
    // Clear any scheduled timeouts for this user
    for (const reminder of userReminders) {
        if (activeReminders.has(reminder.id)) {
            clearTimeout(activeReminders.get(reminder.id));
            activeReminders.delete(reminder.id);
        }
    }
    const sql = 'DELETE FROM reminders WHERE discord_id = ?';
    const result = await db.query(sql, [discordId]);
    return result.affectedRows;
}


/**
 * Fetches all reminders for a given user from the database.
 * @param {string} discordId The user's Discord ID.
 * @returns {Promise<Array<object>>} An array of reminder objects.
 */
async function getReminders(discordId) {
    const sql = 'SELECT * FROM reminders WHERE discord_id = ? ORDER BY remind_at ASC';
    return db.query(sql, [discordId]);
}


/**
 * Loads all upcoming reminders from the database on startup and schedules them.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function loadReminders(client) {
    logger.info('Loading and scheduling reminders from the database...');
    const now = Date.now();
    try {
        const rows = await db.query('SELECT * FROM reminders WHERE remind_at > ?', [now]);
        let scheduledCount = 0;
        for (const reminder of rows) {
            scheduleReminder(client, reminder);
            scheduledCount++;
        }
        logger.success(`Scheduled ${scheduledCount} upcoming reminder(s).`);

        // Clean up any past reminders that were missed (e.g., if the bot was offline)
        const cleanupResult = await db.query('DELETE FROM reminders WHERE remind_at <= ?', [now]);
        if (cleanupResult.affectedRows > 0) {
            logger.info(`Cleaned up ${cleanupResult.affectedRows} past reminder(s).`);
        }
    } catch (error) {
        logger.error('Failed to load reminders from database:', error);
    }
}

module.exports = {
    addReminder,
    scheduleReminder,
    deleteReminder,
    deleteAllReminders,
    getReminders,
    loadReminders,
};

