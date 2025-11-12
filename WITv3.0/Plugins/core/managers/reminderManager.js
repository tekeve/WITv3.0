/**
 * Manages scheduling and executing reminders.
 * This helper is refactored as a class to be used by the Core plugin.
 */
class ReminderManager {

    /**
     * @param {object} plugin - The core plugin instance.
     */
    constructor(plugin) {
        // Unpack the shared services from the plugin
        this.client = plugin.client;
        this.db = plugin.db;
        this.logger = plugin.logger;
    }

    /**
     * Loads all pending reminders from the database and schedules them.
     * This is the logic that was in your clientReady event.
     */
    async loadAndScheduleReminders() {
        this.logger.info('Loading and scheduling reminders from the database...');
        try {
            // --- This is just example logic ---
            // --- Replace this with your actual logic from helpers/reminderManager.js ---

            const [reminders] = await this.db.query("SELECT * FROM reminders WHERE remind_at > NOW()");

            if (reminders.length === 0) {
                this.logger.info('No upcoming reminders found.');
                return;
            }

            let scheduledCount = 0;
            for (const reminder of reminders) {
                const delay = new Date(reminder.remind_at).getTime() - Date.now();

                if (delay > 0) {
                    setTimeout(() => {
                        this.executeReminder(reminder);
                    }, delay);
                    scheduledCount++;
                }
            }

            this.logger.success(`Scheduled ${scheduledCount} upcoming reminder(s).`);

            // --- End of example logic ---

        } catch (error) {
            this.logger.error('Failed to load reminders:', { error: error.stack || error });
        }
    }

    /**
     * Executes a single reminder (e.g., sends a DM).
     * @param {object} reminder - The reminder object from the database.
     */
    async executeReminder(reminder) {
        this.logger.info(`Executing reminder ${reminder.id} for user ${reminder.user_id}`);
        try {
            // --- Example logic ---
            const user = await this.client.users.fetch(reminder.user_id);
            if (user) {
                await user.send(`**Reminder:**\n>>> ${reminder.message_text}`);
            }
            // Delete from DB
            await this.db.query("DELETE FROM reminders WHERE id = ?", [reminder.id]);
            // --- End of example logic ---
        } catch (error) {
            this.logger.error(`Failed to execute reminder ${reminder.id}:`, { error: error.stack || error });
        }
    }

    // ... Add your 'createReminder' method here ...
}

// Export the class
module.exports = ReminderManager;