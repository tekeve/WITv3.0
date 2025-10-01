const db = require('@helpers/database');
const logger = require('@helpers/logger');

let config = null; // In-memory cache for the config

/**
 * Fetches the configuration from the database and populates the in-memory cache.
 * Now includes robust error handling for JSON parsing and loads Google Docs/Sheets mappings.
 */
async function loadConfig() {
    try {
        const newConfig = {};
        // 1. Load main config from the 'config' table
        const configRows = await db.query('SELECT key_name, value FROM config');
        for (const row of configRows) {
            try {
                newConfig[row.key_name] = JSON.parse(row.value);
            } catch (e) {
                logger.warn(`Could not parse JSON for config key "${row.key_name}". Using raw value. Error: ${e.message}`);
                newConfig[row.key_name] = row.value;
            }
        }

        // 2. Load Google Sheets mappings
        newConfig.googleSheets = {};
        const sheetRows = await db.query('SELECT alias, sheet_id FROM google_sheets');
        for (const row of sheetRows) {
            // The value from the database is an array, so we take the first element.
            newConfig.googleSheets[row.alias] = row.sheet_id;
        }

        // 3. Load Google Docs mappings
        newConfig.googleDocs = {};
        const docRows = await db.query('SELECT alias, doc_id FROM google_docs');
        for (const row of docRows) {
            newConfig.googleDocs[row.alias] = row.doc_id;
        }

        config = newConfig; // Atomically update the config cache
        logger.success('Configuration loaded/reloaded from the database, including Google Docs/Sheets.');

    } catch (error) {
        logger.error('Failed to load configuration from the database:', error);
        // In case of a DB failure, we keep the last known valid config (if any)
        // to prevent the bot from becoming completely non-functional.
    }
}

module.exports = {
    get: () => config,

    /**
     * Public method to trigger a reload of the configuration from the database.
     * Renamed for clarity.
     */
    reloadConfig: async () => {
        await loadConfig();
    },
};