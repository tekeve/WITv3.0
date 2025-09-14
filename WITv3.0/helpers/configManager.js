const db = require('@helpers/dbService');
const logger = require('./logger');

let config = null; // In-memory cache for the config

/**
 * Fetches the configuration from the database and populates the in-memory cache.
 * Now includes robust error handling for JSON parsing.
 */
async function loadConfig() {
    try {
        const newConfig = {};
        const rows = await db.query('SELECT key_name, value FROM config');

        for (const row of rows) {
            try {
                // Attempt to parse the value as JSON.
                newConfig[row.key_name] = JSON.parse(row.value);
            } catch (e) {
                // If parsing fails, log a warning and use the raw value.
                // This prevents a crash if a single config value is not valid JSON.
                logger.warn(`Could not parse JSON for config key "${row.key_name}". Using raw value. Error: ${e.message}`);
                newConfig[row.key_name] = row.value;
            }
        }

        config = newConfig; // Atomically update the config cache
        logger.success('Configuration loaded/reloaded from the database.');

    } catch (error) {
        logger.error('Failed to load configuration from the database:', error);
        // In case of a DB failure, we keep the last known valid config (if any)
        // to prevent the bot from becoming completely non-functional.
    }
}


module.exports = {
    /**
     * Gets the current in-memory configuration object.
     * @returns {object | null} The configuration object or null if not loaded.
     */
    get: () => config,

    /**
     * Public method to trigger a reload of the configuration from the database.
     * Renamed for clarity.
     */
    reloadConfig: async () => {
        await loadConfig();
    },
};

