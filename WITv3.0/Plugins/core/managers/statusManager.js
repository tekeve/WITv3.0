const { ActivityType } = require('discord.js');

// Store the timeout ID in a variable to manage it
let expiryTimeout = null;

class StatusManager { 
    /**
     * 
     * @param {object} plugin - The core plugin instance.
     */
    constructor(plugin) {
        this.client = plugin.client;
        this.db = plugin.db;
        this.logger = plugin.logger;
    }

    async restoreSavedStatus() {
        this.logger.info('Restoring saved status...');
        try {
            // --- This is just example logic ---
            // --- Replace this with your actual logic from helpers/statusManager.js ---

            // Assuming you have a table for this.
            // If it was just a hardcoded string, that's fine too.
            const [rows] = await this.db.query("SELECT statusText FROM bot_status WHERE id = 1 LIMIT 1");

            let statusText = "Watching ... always watching ..."; // Default
            if (rows.length > 0) {
                statusText = rows[0].status_text;
            }

            // Type 3 is "Watching"
            this.client.user.setActivity(statusText, { type: 3 });
            this.logger.success(`Restored saved status: "${statusText}"`);

            // --- End of example logic ---

        } catch (error) {
            this.logger.error('Failed to restore saved status:', { error: error.stack || error });
        }
    }

    /**
     * Sets and saves a new status.
     * @param {string} newStatus - The new status text.
     */
    async setStatus(newStatus) {
        this.logger.info(`Setting new status: "${newStatus}"`);
        try {
            // --- Example logic ---
            this.client.user.setActivity(newStatus, { type: 3 });
            // Save it to DB
            await this.db.query("UPDATE bot_status SET status_text = ? WHERE id = 1", [newStatus]);
            this.logger.success('New status set and saved.');
            // --- End of example logic ---
        } catch (error) {
            this.logger.error('Failed to set new status:', { error: error.stack || error });
        }
    }
}

module.exports = StatusManager;
