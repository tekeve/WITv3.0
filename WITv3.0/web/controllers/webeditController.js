const logger = require('@helpers/logger');
const tableManager = require('@helpers/managers/tableManager');
const db = require('@helpers/database');

/**
 * Renders the web editor page with data from the selected table.
 * @param {Client} client - The Discord client instance.
 * @returns An async function to handle the GET request.
 */
exports.showEditor = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeWebEditTokens.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This web editor link is invalid or has expired.' });
    }

    const { tableName } = tokenData;
    const keyColumn = tableManager.getKeyColumnForTable(tableName);
    if (!keyColumn) {
        return res.status(500).render('error', { title: 'Configuration Error', message: `No primary key defined for table '${tableName}'.` });
    }

    try {
        const tableData = await db.query(`SELECT * FROM \`${tableName}\``);
        const headers = tableData.length > 0 ? Object.keys(tableData[0]) : [];

        res.render('webEditForm', {
            tableName,
            tableData,
            headers,
            primaryKey: keyColumn,
            token
        });
    } catch (error) {
        logger.error(`Failed to fetch data for web editor for table ${tableName}:`, error);
        res.status(500).render('error', { title: 'Database Error', message: 'Could not retrieve table data.' });
    }
};

/**
 * Handles the submission from the web editor and updates, adds, or deletes rows.
 * @param {Client} client - The Discord client instance.
 * @returns An async function to handle the POST request.
 */
exports.handleUpdate = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeWebEditTokens.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This web editor link has expired. Your changes were not saved.' });
    }
    client.activeWebEditTokens.delete(token); // Invalidate token immediately

    const { tableName } = tokenData;
    const { rows, newRows, deletedRows } = req.body;
    const keyColumn = tableManager.getKeyColumnForTable(tableName);
    const dbPromises = [];

    try {
        // 1. Handle Deletions
        if (deletedRows && Array.isArray(deletedRows)) {
            for (const keyToDelete of deletedRows) {
                dbPromises.push(tableManager.removeKey(tableName, keyToDelete));
            }
        }

        // 2. Handle Additions
        if (newRows && Array.isArray(newRows)) {
            for (const rowData of newRows) {
                const primaryKeyValue = rowData[keyColumn];
                if (primaryKeyValue) { // Ensure the new row has a primary key
                    dbPromises.push(tableManager.setValue(tableName, primaryKeyValue, JSON.stringify(rowData)));
                }
            }
        }

        // 3. Handle Updates
        if (rows) {
            for (const [primaryKeyValue, rowData] of Object.entries(rows)) {
                // Ensure we don't try to update a row that was also marked for deletion
                if (!deletedRows || !deletedRows.includes(primaryKeyValue)) {
                    dbPromises.push(tableManager.setValue(tableName, primaryKeyValue, JSON.stringify(rowData)));
                }
            }
        }

        await Promise.all(dbPromises);

        // Reload config if necessary
        if (tableName === 'config') {
            const configManager = require('@helpers/configManager');
            await configManager.reloadConfig();
            logger.success('Live configuration has been reloaded after web edit.');
        }
        if (tableName === 'roleHierarchy') {
            const roleHierarchyManager = require('@helpers/roleHierarchyManager');
            await roleHierarchyManager.reloadHierarchy();
            logger.success('Role hierarchy has been reloaded after web edit.');
        }

        res.render('success', { title: 'Update Successful', message: `The table '${tableName}' has been updated successfully.` });
    } catch (error) {
        logger.error(`Failed to update table ${tableName} from web editor:`, error);
        res.status(500).render('error', { title: 'Database Error', message: `An error occurred while updating the table: ${error.message}` });
    }
};
