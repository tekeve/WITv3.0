const db = require('./dbService');
const logger = require('./logger');

let configCache = null;

/**
 * Loads the entire configuration from the database into an in-memory cache.
 * This should be called once on bot startup.
 */
async function loadConfig() {
    try {
        const rows = await db.query('SELECT `key`, `value` FROM `config`');
        const config = {};
        for (const row of rows) {
            // The value is stored as a JSON string, so we parse it.
            // The JSON column type in MySQL/MariaDB might return it as an object already,
            // but parsing handles the string case reliably.
            config[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        }
        configCache = config;
        logger.success('Configuration loaded from database.');
        return configCache;
    } catch (error) {
        logger.error('Failed to load configuration from database:', error);
        // This is a critical error, so we throw it to stop the bot from starting
        // with a missing or corrupt configuration.
        throw new Error('Could not load configuration from the database.');
    }
}

/**
 * Updates a single configuration value in the database and refreshes the cache.
 * @param {string} key - The configuration key to update.
 * @param {any} value - The new value to set. Must be serializable to JSON.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function setConfig(key, value) {
    try {
        const valueJson = JSON.stringify(value);
        const sql = 'INSERT INTO `config` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)';
        await db.query(sql, [key, valueJson]);
        logger.info(`Configuration key '${key}' updated in the database.`);
        // Reload the cache to reflect the change immediately across the application
        await loadConfig();
        return true;
    } catch (error) {
        logger.error(`Failed to set configuration for key '${key}':`, error);
        return false;
    }
}

/**
 * A simple getter to retrieve the cached config object.
 * @returns {object} The cached configuration object.
 */
function get() {
    if (!configCache) {
        throw new Error('Configuration has not been loaded yet. Ensure loadConfig() is called on startup.');
    }
    return configCache;
}

module.exports = {
    loadConfig,
    setConfig,
    get,
};
