const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

// A safelist of tables that the /config command is allowed to edit.
const editableTables = ['config', 'google_docs', 'google_sheets', 'roleHierarchy'];

// Maps table names to their respective primary key column names.
const tableKeyMap = {
    config: 'key_name',
    google_docs: 'alias',
    google_sheets: 'alias',
    roleHierarchy: 'roleName',
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
            roleHierarchy: 'promote', // Special handling for roleHierarchy
        };
        const keyColumn = getKeyColumnForTable(tableName);
        const valueColumn = valueColumnMap[tableName];

        if (!keyColumn || !valueColumn) return false;

        try {
            let sql, params;
            // Special handling for roleHierarchy which has a different structure
            if (tableName === 'roleHierarchy') {
                try {
                    const parsedValue = JSON.parse(value);
                    sql = `
                        INSERT INTO \`roleHierarchy\` (\`roleName\`, \`promote\`, \`demote\`)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE \`promote\` = VALUES(\`promote\`), \`demote\` = VALUES(\`demote\`)`;
                    params = [key, JSON.stringify(parsedValue.promote), JSON.stringify(parsedValue.demote)];
                } catch (e) {
                    logger.error('Invalid JSON provided for roleHierarchy value:', e);
                    return false;
                }
            } else {
                sql = `
                    INSERT INTO \`${tableName}\` (\`${keyColumn}\`, \`${valueColumn}\`)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE \`${valueColumn}\` = VALUES(\`${valueColumn}\`)`;
                params = [key, value];
            }
            await db.query(sql, params);
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

