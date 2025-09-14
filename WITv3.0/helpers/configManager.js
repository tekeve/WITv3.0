const db = require('./dbService');
const logger = require('./logger');

let config = null;

/**
 * Internal function to fetch config from the DB and cache it.
 */
async function loadConfigInternal() {
    try {
        const rows = await db.query('SELECT `key`, `value` FROM `config`');
        const loadedConfig = {};
        for (const row of rows) {
            try {
                loadedConfig[row.key] = JSON.parse(row.value);
            } catch (e) {
                logger.warn(`Could not parse config value for key "${row.key}". Using raw value.`);
                loadedConfig[row.key] = row.value;
            }
        }
        config = loadedConfig;
        logger.success('Configuration loaded successfully from database.');
    } catch (error) {
        logger.error('Failed to load configuration from database:', error);
        config = {}; // Fallback to prevent crashes
    }
}

module.exports = {
    /**
     * Loads or reloads the entire configuration from the database.
     * Should be called once on startup and after any config change.
     */
    loadConfig: async () => {
        await loadConfigInternal();
    },

    /**
     * Synchronously retrieves the cached configuration object.
     * Throws an error if the configuration hasn't been loaded yet.
     * @returns {object} The configuration object.
     */
    get: () => {
        if (config === null) {
            // This case should ideally not be hit if loadConfig is called on startup.
            logger.error("FATAL: configManager.get() was called before config was loaded.");
            throw new Error('Configuration has not been loaded yet. Call loadConfig() on application startup.');
        }
        return config;
    },
};

