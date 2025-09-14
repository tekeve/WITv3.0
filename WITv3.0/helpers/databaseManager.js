const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

// A safelist of tables that the /config command is allowed to edit.
const editableTables = ['config', 'google_docs', 'google_sheets'];

// Maps table names to their respective primary key column names.
const tableKeyMap = {
    config: 'key_name',
    google_docs: 'alias',
    google_sheets: 'alias',
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
    getKeys: async (tableName, filter) => {
        if (!isTableEditable(tableName)) return [];
        const keyColumn = getKeyColumnForTable(tableName);
        if (!keyColumn) return [];

        try {
            // Use backticks to safely include the table and column names in the query
            const sql = `SELECT \`${keyColumn}\` FROM \`${tableName}\` WHERE \`${keyColumn}\` LIKE ? LIMIT 25`;
            const rows = await db.query(sql, [`%${filter}%`]);
            return rows.map(row => ({
                name: row[keyColumn],
                value: row[keyColumn],
            }));
        } catch (error) {
            logger.error(`Failed to get keys from table ${tableName}:`, error);
            return [];
        }
    },

    /**
     * Sets (inserts or updates) a value in a specified table.
     * @param {string} tableName - The name of the table to modify.
     * @param {string} key - The key of the entry to set.
     * @param {string} value - The value to set for the key.
     * @returns {Promise<boolean>} - True on success, false on failure.
     */
    setValue: async (tableName, key, value) => {
        if (!isTableEditable(tableName)) return false;
        // The value column is different for each table, so we map it here.
        const valueColumnMap = {
            config: 'value',
            google_docs: 'doc_id',
            google_sheets: 'sheet_id',
        };
        const keyColumn = getKeyColumnForTable(tableName);
        const valueColumn = valueColumnMap[tableName];

        if (!keyColumn || !valueColumn) return false;

        try {
            const sql = `
                INSERT INTO \`${tableName}\` (\`${keyColumn}\`, \`${valueColumn}\`) 
                VALUES (?, ?) 
                ON DUPLICATE KEY UPDATE \`${valueColumn}\` = VALUES(\`${valueColumn}\`)`;
            await db.query(sql, [key, value]);
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

