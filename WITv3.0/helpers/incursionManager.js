const db = require('./dbService');
const logger = require('./logger');

let incursionSystems = null;

/**
 * Fetches the latest incursion system data from the database and updates the in-memory cache.
 */
async function loadIncursionSystems() {
    try {
        logger.info('Loading incursion systems data from the database...');
        const rows = await db.query('SELECT * FROM incursion_systems');
        incursionSystems = rows;
        logger.success(`Successfully loaded ${rows.length} incursion systems.`);
    } catch (error) {
        logger.error('Failed to load incursion systems from database:', error);
        incursionSystems = []; // Ensure it's an empty array on failure
    }
}

/**
 * Returns the cached incursion systems array.
 * @returns {Array} The array of incursion system objects.
 */
function get() {
    return incursionSystems;
}

module.exports = {
    loadIncursionSystems,
    get
};

