const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

// A safelist of tables that the /config command is allowed to edit.
const editableTables = [
    'auth',
    'bot_status',
    'characters',
    'config',
    'google_docs',
    'google_sheets',
    'incursion_state',
    'incursion_systems',
    'roleHierarchy',
    'users'
];

// Maps table names to their respective primary key column names.
const tableKeyMap = {
    auth: 'discord_id',
    bot_status: 'id',
    characters: 'character_id',
    config: 'key_name',
    google_docs: 'alias',
    google_sheets: 'alias',
    incursion_state: 'id',
    incursion_systems: 'Constellation_id',
    roleHierarchy: 'roleName',
    users: 'discord_id',
};

/**
 * Checks if a table is in the safelist of editable tables.
 * @param {string} tableName - The name of the table to check.
 * @returns {boolean} - True if the table is editable, false otherwise.
 */
function isTableEditable(tableName) {
    return editableTables.includes(tableName);
}

/**
 * Gets the name of the primary key column for a given table.
 * @param {string} tableName - The name of the table.
 * @returns {string|null} - The key column name or null if not found.
 */
function getKeyColumnForTable(tableName) {
    return tableKeyMap[tableName] || null;
}

module.exports = {
    // Expose the list of editable tables for the command builder
    editableTables,

    /**
     * Fetches keys from a table for autocomplete suggestions.
     * @param {string} tableName - The name of the table to query.
     * @param {string} filter - The text the user has typed so far.
     * @returns {Promise<Array<{name: string, value: string}>>} - A list of choices for Discord.
     */
    getKeys: async (tableName, filter = '') => {
        if (!isTableEditable(tableName)) return [];
        const keyColumn = getKeyColumnForTable(tableName);
        if (!keyColumn) return [];

        try {
            // Use backticks to safely include the table and column names in the query
            const sql = `SELECT \`${keyColumn}\` FROM \`${tableName}\` WHERE \`${keyColumn}\` LIKE ? LIMIT 25`;
            const rows = await db.query(sql, [`%${filter}%`]);

            const mappedRows = rows.map(row => ({
                name: row[keyColumn],
                value: row[keyColumn],
            }));

            // **FIX**: Add a filter to ensure we only return valid entries.
            // This prevents crashes if a key in the database is unexpectedly NULL or invalid,
            // which would cause an error when trying to read its `length` property.
            const validRows = mappedRows.filter(row => row.name && typeof row.name === 'string');

            return validRows;

        } catch (error) {
            logger.error(`Failed to get keys from table ${tableName}:`, error);
            return [];
        }
    },

    /**
     * Sets (inserts or updates) a value in a specified table.
     * This now supports simple key-value tables and complex multi-column tables via JSON.
     * @param {string} tableName - The name of the table to modify.
     * @param {string} primaryKeyValue - The value of the primary key for the row to modify.
     * @param {string} rowDataJson - The full row data as a JSON string.
     * @returns {Promise<boolean>} - True on success, false on failure.
     */
    setValue: async (tableName, primaryKeyValue, rowDataJson) => {
        if (!isTableEditable(tableName)) return false;
        const keyColumn = getKeyColumnForTable(tableName);
        if (!keyColumn) return false;

        let rowData;
        try {
            rowData = JSON.parse(rowDataJson);
        } catch (e) {
            logger.error(`Invalid JSON provided for table ${tableName}:`, e.message);
            return false;
        }

        // Ensure the primary key from the input field is included in the data object
        rowData[keyColumn] = primaryKeyValue;

        const columns = Object.keys(rowData);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => {
            const value = rowData[col];
            // Stringify objects/arrays for JSON columns
            return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
        });

        const updateClause = columns
            .filter(col => col !== keyColumn)
            .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
            .join(', ');

        try {
            const sql = `
                INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`)
                VALUES (${placeholders})
                ON DUPLICATE KEY UPDATE ${updateClause}`;

            await db.query(sql, values);
            return true;
        } catch (error) {
            logger.error(`Failed to set value in table ${tableName}:`, error);
            return false;
        }
    },

    /**
     * Removes a key from a specified table.
     * @param {string} tableName - The name of the table to modify.
     * @param {string} key - The key of the entry to remove.
     * @returns {Promise<boolean>} - True on success, false on failure.
     */
    removeKey: async (tableName, key) => {
        if (!isTableEditable(tableName)) return false;
        const keyColumn = getKeyColumnForTable(tableName);
        if (!keyColumn) return false;

        try {
            const sql = `DELETE FROM \`${tableName}\` WHERE \`${keyColumn}\` = ?`;
            const result = await db.query(sql, [key]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`Failed to remove key from table ${tableName}:`, error);
            return false;
        }
    },
};

