const db = require('./dbService');
const logger = require('./logger');

let incursionSystems = null;

/**
 * Internal function to fetch incursion system data from the DB and cache it.
 */
async function loadIncursionSystemsInternal() {
    try {
        const rows = await db.query('SELECT * FROM `incursion_systems`');
        incursionSystems = rows;
        logger.success(`${rows.length} incursion system constellations loaded from database.`);
    } catch (error) {
        logger.error('Failed to load incursion systems from database:', error);
        incursionSystems = []; // Fallback to an empty array to prevent crashes
    }
}

module.exports = {
    /**
     * Loads or reloads all incursion system data from the database.
     * This should be called once on application startup.
     */
    load: async () => {
        await loadIncursionSystemsInternal();
    },

    /**
     * Synchronously retrieves the cached incursion system data.
     * Throws an error if the data hasn't been loaded yet.
     * @returns {Array} An array of incursion system objects.
     */
    get: () => {
        if (incursionSystems === null) {
            logger.error("FATAL: incursionManager.get() was called before data was loaded.");
            throw new Error('Incursion systems data has not been loaded yet. Call load() on application startup.');
        }
        return incursionSystems;
    },
};
