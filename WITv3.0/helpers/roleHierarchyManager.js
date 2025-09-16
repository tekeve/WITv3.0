const db = require('@helpers/database');
const logger = require('@helpers/logger');

let hierarchyCache = null;

/**
 * Loads the role hierarchy configuration from the database and populates the cache.
 */
async function loadHierarchy() {
    try {
        const newHierarchy = {};
        const rows = await db.query('SELECT roleName, promote, demote FROM roleHierarchy');

        for (const row of rows) {
            try {
                // Each row represents a rank.
                newHierarchy[row.roleName] = {
                    promote: JSON.parse(row.promote || '{}'),
                    demote: JSON.parse(row.demote || '{}')
                };
            } catch (e) {
                logger.warn(`Could not parse JSON for rank "${row.roleName}". Skipping. Error: ${e.message}`);
            }
        }

        hierarchyCache = newHierarchy;
        logger.success('Role hierarchy loaded/reloaded from the database.');

    } catch (error) {
        logger.error('Failed to load role hierarchy from the database:', error);
        hierarchyCache = {}; // Ensure cache is not null on error
    }
}

/**
 * Gets the role hierarchy. If it's not cached, it loads it first.
 * @returns {Promise<object>} The hierarchy object.
 */
async function getHierarchy() {
    if (hierarchyCache === null) {
        await loadHierarchy();
    }
    return hierarchyCache;
}

/**
 * Gets a sorted list of rank names for autocomplete.
 * @returns {Promise<string[]>}
 */
async function getRankNames() {
    const hierarchy = await getHierarchy();
    // Guard against a null or undefined hierarchy object before getting keys
    if (!hierarchy) {
        logger.warn('Attempted to get rank names, but hierarchy is not loaded or is empty.');
        return [];
    }
    return Object.keys(hierarchy).sort();
}

/**
 * Public method to trigger a reload of the hierarchy from the database.
 */
async function reloadHierarchy() {
    await loadHierarchy();
}

module.exports = {
    get: getHierarchy,
    getRankNames,
    reloadHierarchy,
};

