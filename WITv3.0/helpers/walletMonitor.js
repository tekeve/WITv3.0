const db = require('@helpers/database');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');
const authManager = require('@helpers/authManager');
const configManager = require('@helpers/configManager');
const charManager = require('@helpers/characterManager'); // To potentially get member names

// In-memory cache to store the last processed transaction ID for each corp/division
// Key: `${corporationId}-${division}`
// Value: BigInt(lastTransactionId)
const lastTransactionIdCache = new Map();

/**
 * Loads the last processed transaction IDs from the database on startup.
 */
async function initializeLastTransactionIds() {
    try {
        // Fetch the maximum transaction_id for each combination of corporation_id and division
        const rows = await db.query(`
            SELECT corporation_id, division, MAX(transaction_id) as max_id
            FROM corp_wallet_transactions
            GROUP BY corporation_id, division
        `);
        rows.forEach(row => {
            const key = `${row.corporation_id}-${row.division}`;
            // Store the max_id as a BigInt in the cache
            lastTransactionIdCache.set(key, BigInt(row.max_id));
        });
        logger.info(`[WalletMonitor] Initialized last transaction ID cache from DB. Cache size: ${lastTransactionIdCache.size}`);
    } catch (error) {
        logger.error('[WalletMonitor] Failed to initialize last transaction ID cache:', error);
        // If initialization fails, the cache remains empty, and the sync will fetch more data initially.
    }
}

/**
 * Attempts to automatically categorize a transaction based on its details.
 * @param {object} transaction - The transaction object from ESI.
 * @returns {string|null} The category name ('srp_in', 'srp_out', 'giveaway', 'structure', 'office', 'tax', 'other') or null.
 */
function autoCategorizeTransaction(transaction) {
    const srpAmount = 20000000; // 20 million ISK
    const tolerance = 1; // Allow for slight rounding errors if needed

    // Check for SRP Contribution (Incoming)
    // Using Math.abs ensures it works even if the amount is slightly off
    if (transaction.amount > 0 && Math.abs(transaction.amount - srpAmount) <= tolerance) {
        // Could potentially add a check here to see if second_party_id is a known corp member
        // by comparing against a list fetched via charManager or another source.
        return 'srp_in';
    }

    // Check for potential SRP Payout (Outgoing) - Requires specific reasons
    if (transaction.amount < 0 && transaction.reason) {
        const reasonLower = transaction.reason.toLowerCase();
        if (reasonLower.includes('srp payout') || reasonLower.includes('srp:')) {
            return 'srp_out';
        }
        if (reasonLower.includes('giveaway') || reasonLower.includes('prize')) {
            return 'giveaway';
        }
    }

    // Check ref_type for common categories
    const refTypeLower = transaction.ref_type.toLowerCase();
    if (refTypeLower.includes('structure') || refTypeLower.includes('upkeep') || refTypeLower.includes('fuel')) {
        return 'structure';
    }
    if (refTypeLower.includes('office rental fee')) {
        return 'office';
    }
    // ESI ref_type for corp taxes
    if (refTypeLower.includes('corporation tax') || refTypeLower.includes('transaction tax')) {
        return 'tax';
    }

    // Default to 'other' if no specific category matches
    return 'other';
}

/**
 * Fetches names for IDs involved in a batch of transactions.
 * @param {Set<number>} ids - A set of character/corporation/alliance IDs.
 * @returns {Promise<Map<number, string>>} A map of ID to Name.
 */
async function fetchNamesForIds(ids) {
    // Filter out potential 0 or null IDs before processing
    const idArray = Array.from(ids).filter(id => id && id > 0);
    const namesMap = new Map();

    // If no valid IDs remain after filtering, return an empty map
    if (idArray.length === 0) {
        return namesMap;
    }

    try {
        // ESI /universe/names/ endpoint can take up to 1000 IDs per request
        const chunkSize = 1000;
        for (let i = 0; i < idArray.length; i += chunkSize) {
            const chunk = idArray.slice(i, i + chunkSize);
            // Make the POST request to ESI to resolve IDs to names
            const response = await esiService.post({ endpoint: '/universe/names/', data: chunk, caller: __filename });
            // If the response is valid and is an array, populate the namesMap
            if (response && Array.isArray(response)) {
                response.forEach(item => {
                    namesMap.set(item.id, item.name);
                });
            }
        }
    } catch (error) {
        logger.error('[WalletMonitor] Failed to fetch names for IDs:', error);
        // Log the error but continue; names will be null in the DB for failed lookups.
    }
    return namesMap;
}


/**
 * Fetches new wallet journal entries for a specific corporation division from ESI.
 * It handles pagination automatically and filters based on the `fromId`.
 * @param {number} corporationId - The EVE corporation ID.
 * @param {number} division - The wallet division number (1-7).
 * @param {string} accessToken - A valid ESI access token for a character with corp wallet access.
 * @param {bigint|null} [fromId=null] - Optional: Fetch transactions starting strictly after this ID.
 * @returns {Promise<Array>} A list of new transaction objects from ESI, sorted oldest first.
 */
async function fetchWalletJournalPage(corporationId, division, accessToken, fromId = null) {
    let allNewTransactions = [];
    let page = 1;
    const maxPagesToFetch = 10; // Safety limit: fetch a maximum of 10 pages (~25000 entries) per sync cycle

    try {
        while (page <= maxPagesToFetch) {
            const response = await esiService.get({
                endpoint: `/corporations/${corporationId}/wallets/${division}/journal/`,
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { page }, // ESI pagination starts at page 1
                caller: __filename
            });

            // Check if the response or data is invalid or empty
            if (!response || !Array.isArray(response.data) || response.data.length === 0) {
                break; // Stop if no data is returned or response is invalid
            }

            const transactionsOnPage = response.data;
            let reachedLastKnownId = false;

            // Filter transactions: only include those with an ID greater than fromId
            const newTransactionsOnPage = transactionsOnPage.filter(t => {
                const currentId = BigInt(t.id);
                if (fromId !== null && currentId <= fromId) {
                    reachedLastKnownId = true; // Mark that we've encountered an older or known transaction
                    return false; // Exclude this transaction
                }
                return true; // Include this new transaction
            });

            allNewTransactions.push(...newTransactionsOnPage);

            // If we found an older transaction on this page, we don't need to fetch further pages
            if (reachedLastKnownId) {
                break;
            }

            // Check ESI's x-pages header to see if there are more pages
            const pagesHeader = response.headers ? response.headers['x-pages'] : null;
            const totalPages = pagesHeader ? parseInt(pagesHeader, 10) : 1;

            // Stop if we have fetched the last available page
            if (page >= totalPages) {
                break;
            }

            page++; // Move to the next page
        }
    } catch (error) {
        // Log the specific error during fetching
        logger.error(`[WalletMonitor] Failed fetching journal page ${page} for Corp ${corporationId}, Div ${division}:`, error.message);
        // Re-throw the error to be handled by the syncWalletTransactions function
        throw error;
    }

    // ESI returns journal entries newest first, so reverse the array
    // to process them chronologically (oldest first).
    return allNewTransactions.reverse();
}

/**
 * Fetches, processes, and stores new wallet transactions for configured corporations/divisions.
 * This is the main function called by the scheduler.
 */
async function syncWalletTransactions() {
    logger.info('[WalletMonitor] Starting wallet transaction sync...');
    const config = configManager.get();

    // Retrieve Corporation ID and Wallet Divisions from config, providing defaults if necessary
    // Assumes config values are stored as arrays, takes the first element.
    const corporationIdStr = config.srpCorporationId?.[0];
    const divisionsToMonitorStr = config.srpWalletDivisions || []; // Default to empty array if not set

    // Validate Corporation ID
    if (!corporationIdStr) {
        logger.warn('[WalletMonitor] srpCorporationId not configured in the database. Skipping wallet sync.');
        return;
    }
    const corporationId = parseInt(corporationIdStr, 10);
    if (isNaN(corporationId)) {
        logger.warn(`[WalletMonitor] Invalid srpCorporationId found in config: "${corporationIdStr}". Skipping wallet sync.`);
        return;
    }

    // Validate and filter Wallet Divisions (must be between 1 and 7)
    const divisionsToMonitor = divisionsToMonitorStr
        .map(d => parseInt(d, 10))
        .filter(d => !isNaN(d) && d >= 1 && d <= 7);

    if (divisionsToMonitor.length === 0) {
        logger.warn('[WalletMonitor] No valid srpWalletDivisions (1-7) configured in the database. Skipping wallet sync.');
        return;
    }

    // Identify an authenticated admin user to perform ESI calls
    // TODO: Implement a more robust way to select/manage the ESI token character,
    // perhaps using a dedicated config key or fetching a user with specific roles.
    const adminUsers = config.adminUsers || [];
    if (adminUsers.length === 0) {
        logger.error('[WalletMonitor] No adminUsers configured. Cannot authenticate for wallet access. Skipping sync.');
        return;
    }
    const authDiscordId = adminUsers[0]; // Using the first admin user for now

    // Obtain a valid ESI access token
    const accessToken = await authManager.getAccessToken(authDiscordId);
    if (!accessToken) {
        logger.error(`[WalletMonitor] Could not get a valid ESI token for admin user ${authDiscordId}. Skipping sync. Ensure an admin has authenticated with the required scopes.`);
        return;
    }

    let totalNewTransactionsProcessed = 0;

    // Iterate through each configured division
    for (const division of divisionsToMonitor) {
        const cacheKey = `${corporationId}-${division}`;
        const lastKnownId = lastTransactionIdCache.get(cacheKey) || null; // Get last processed ID from cache
        let highestProcessedIdThisSync = lastKnownId; // Track the newest ID found in this run

        try {
            logger.info(`[WalletMonitor] Fetching journal - Corp: ${corporationId}, Div: ${division}, After ID: ${lastKnownId || 'None'}`);
            // Fetch new transactions since the last known ID
            const newTransactions = await fetchWalletJournalPage(corporationId, division, accessToken, lastKnownId);

            if (newTransactions.length === 0) {
                logger.info(`[WalletMonitor] No new transactions for division ${division}.`);
                continue; // Skip to the next division if no new transactions
            }

            logger.info(`[WalletMonitor] Found ${newTransactions.length} new transactions for division ${division}. Processing...`);

            // Collect all unique IDs for name resolution
            const idsToFetchNamesFor = new Set();
            newTransactions.forEach(t => {
                if (t.first_party_id) idsToFetchNamesFor.add(t.first_party_id);
                if (t.second_party_id) idsToFetchNamesFor.add(t.second_party_id);
                if (t.tax_receiver_id) idsToFetchNamesFor.add(t.tax_receiver_id);
            });

            // Fetch names for all collected IDs
            const namesMap = await fetchNamesForIds(idsToFetchNamesFor);

            const valuesToInsert = [];
            // Process each new transaction
            for (const t of newTransactions) {
                const currentId = BigInt(t.id);

                // This check should technically be redundant due to filtering in fetchWalletJournalPage, but acts as a safeguard.
                if (lastKnownId !== null && currentId <= lastKnownId) {
                    continue;
                }

                // Retrieve names from the map, defaulting to null if not found
                const firstPartyName = namesMap.get(t.first_party_id) || null;
                const secondPartyName = namesMap.get(t.second_party_id) || null;
                // Automatically categorize the transaction
                const customCategory = autoCategorizeTransaction(t);

                // Prepare the data row for database insertion
                valuesToInsert.push([
                    t.id.toString(), // Store large IDs as strings or ensure DECIMAL/BIGINT column type
                    corporationId,
                    division,
                    new Date(t.date), // Convert ESI date string to Date object
                    t.ref_type,
                    t.first_party_id || null,
                    firstPartyName,
                    t.second_party_id || null,
                    secondPartyName,
                    t.amount,
                    t.balance,
                    t.reason || null,
                    t.tax_receiver_id || null,
                    t.tax_amount || null,
                    t.context_id || null,
                    t.context_type || null,
                    t.description,
                    customCategory
                ]);

                // Update the highest ID processed in this sync run
                if (highestProcessedIdThisSync === null || currentId > highestProcessedIdThisSync) {
                    highestProcessedIdThisSync = currentId;
                }
            }

            // Perform bulk insert if there are new transactions to add
            if (valuesToInsert.length > 0) {
                const sql = `
                    INSERT IGNORE INTO corp_wallet_transactions (
                        transaction_id, corporation_id, division, date, ref_type,
                        first_party_id, first_party_name, second_party_id, second_party_name,
                        amount, balance, reason, tax_receiver_id, tax_amount,
                        context_id, context_type, description, custom_category
                    ) VALUES ?
                `;
                // Using pool.query for bulk insert syntax with an array of value arrays
                const [result] = await db.pool.query(sql, [valuesToInsert]);

                totalNewTransactionsProcessed += result.affectedRows;
                logger.info(`[WalletMonitor] Inserted ${result.affectedRows} transactions for division ${division}. (${valuesToInsert.length - result.affectedRows} duplicates ignored)`);

                // Update the cache with the highest ID processed in this run
                if (highestProcessedIdThisSync !== null) {
                    lastTransactionIdCache.set(cacheKey, highestProcessedIdThisSync);
                }
            } else {
                logger.info(`[WalletMonitor] No transactions newer than ID ${lastKnownId} were found for division ${division} after processing.`);
            }

        } catch (error) {
            // Log errors encountered during the sync for a specific division
            logger.error(`[WalletMonitor] Failed to sync division ${division}:`, error.message);
            // Continue processing the next division
        }
    }

    logger.success(`[WalletMonitor] Wallet sync finished. ${totalNewTransactionsProcessed} total new transactions processed across ${divisionsToMonitor.length} divisions.`);
}

/**
 * Fetches transaction data based on filters for the web UI.
 * @param {object} filters - Filtering options.
 * @returns {Promise<object>} Object containing transactions and total count.
 */
async function getTransactions(filters = {}) {
    const {
        startDate, endDate, divisions = [],
        categorySearch, // Changed from categories
        page = 1, limit = 50,
        refType, partySearch, amountExact, reasonSearch
    } = filters;

    const numLimit = Number(limit);
    const numPage = Number(page);
    const offset = (numPage - 1) * numLimit;

    let whereClauses = [];
    let params = [];

    const config = configManager.get();
    const corporationIdStr = config.srpCorporationId?.[0];
    if (!corporationIdStr) return { transactions: [], total: 0 };
    const corporationId = parseInt(corporationIdStr, 10);
    whereClauses.push('corporation_id = ?');
    params.push(corporationId);

    if (startDate) { whereClauses.push('date >= ?'); params.push(new Date(startDate)); }
    if (endDate) {
        const inclusiveEndDate = new Date(endDate);
        inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1); // Go to the start of the next day
        whereClauses.push('date < ?');
        params.push(inclusiveEndDate);
    }

    if (Array.isArray(divisions) && divisions.length > 0) {
        const validDivisions = divisions.map(Number).filter(d => !isNaN(d));
        if (validDivisions.length > 0) {
            whereClauses.push(`division IN (${validDivisions.map(() => '?').join(',')})`);
            params.push(...validDivisions);
        }
    }

    // --- NEW CATEGORY SEARCH LOGIC ---
    if (categorySearch) {
        if (categorySearch.toLowerCase() === 'uncategorized') {
            whereClauses.push('custom_category IS NULL');
        } else {
            // Map friendly name back to key if possible
            const categoryLabels = {
                'srp in': 'srp_in', 'srp out': 'srp_out', 'giveaway': 'giveaway',
                'structure/upkeep': 'structure', 'office rental': 'office', 'tax': 'tax',
                'other': 'other'
            };
            const searchLower = categorySearch.toLowerCase();
            const matchingKey = categoryLabels[searchLower];

            if (matchingKey) {
                whereClauses.push('custom_category = ?');
                params.push(matchingKey);
            } else {
                // Fallback to LIKE search on the string
                whereClauses.push('custom_category LIKE ?');
                params.push(`%${categorySearch}%`);
            }
        }
    }
    // --- END NEW CATEGORY SEARCH LOGIC ---

    // Add new filter conditions
    if (refType) { whereClauses.push('ref_type LIKE ?'); params.push(`%${refType}%`); }
    if (partySearch) { whereClauses.push('(first_party_name LIKE ? OR second_party_name LIKE ?)'); params.push(`%${partySearch}%`, `%${partySearch}%`); }

    // --- UPDATED AMOUNT LOGIC ---
    if (amountExact !== null && amountExact !== undefined && !isNaN(amountExact)) {
        // We'll check for amount = value OR amount = -value
        whereClauses.push('(amount = ? OR amount = ?)');
        params.push(amountExact, -amountExact);
    }
    // --- END UPDATED AMOUNT LOGIC ---

    if (reasonSearch) { whereClauses.push('(reason LIKE ? OR description LIKE ?)'); params.push(`%${reasonSearch}%`, `%${reasonSearch}%`); }


    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    try {
        const countSql = `SELECT COUNT(*) as total FROM corp_wallet_transactions ${whereString}`;
        const [countResult] = await db.query(countSql, params);
        const total = countResult ? countResult.total : 0;

        const dataSql = `
            SELECT * FROM corp_wallet_transactions
            ${whereString}
            ORDER BY date DESC, transaction_id DESC
            LIMIT ? OFFSET ?
        `;
        const transactions = await db.query(dataSql, [...params, numLimit, offset]);

        return { transactions, total, currentPage: numPage, totalPages: Math.ceil(total / numLimit) };

    } catch (error) {
        logger.error('[WalletMonitor] Error fetching transactions for web UI:', error);
        throw error;
    }
}

/**
* Fetches aggregated wallet data for charts/summaries based on filters.
* @param {object} filters - Filtering options (startDate, endDate, divisions, categorySearch).
* @returns {Promise<object>} Aggregated data including monthly trends, balances, and category totals.
*/
async function getAggregatedData(filters = {}) {
    const {
        startDate,
        endDate,
        divisions = [], // Expecting an array of numbers
        categorySearch   // Changed from categories array to string
    } = filters;

    let whereClauses = [];
    let params = [];

    // Add corporation ID filter (required)
    const config = configManager.get();
    const corporationIdStr = config.srpCorporationId?.[0];
    if (!corporationIdStr) return {}; // Cannot aggregate without corp ID
    const corporationId = parseInt(corporationIdStr, 10);
    whereClauses.push('corporation_id = ?');
    params.push(corporationId);

    // Add date range filters
    if (startDate) {
        whereClauses.push('date >= ?');
        params.push(new Date(startDate));
    }
    if (endDate) {
        const inclusiveEndDate = new Date(endDate);
        inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
        whereClauses.push('date < ?');
        params.push(inclusiveEndDate);
    }

    // Add division filter (only if divisions are provided)
    let divisionFilterParams = [];
    let divisionWhereClause = ''; // Clause specifically for balance query
    if (Array.isArray(divisions) && divisions.length > 0) {
        const validDivisions = divisions.map(Number).filter(d => !isNaN(d));
        if (validDivisions.length > 0) {
            const divisionPlaceholders = validDivisions.map(() => '?').join(',');
            whereClauses.push(`division IN (${divisionPlaceholders})`);
            params.push(...validDivisions);
            divisionFilterParams = validDivisions; // Store valid divisions for balance query
            divisionWhereClause = `AND division IN (${divisionPlaceholders})`; // For balance query
        }
    }

    // --- NEW CATEGORY SEARCH LOGIC ---
    if (categorySearch) {
        if (categorySearch.toLowerCase() === 'uncategorized') {
            whereClauses.push('custom_category IS NULL');
        } else {
            // Map friendly name back to key if possible
            const categoryLabels = {
                'srp in': 'srp_in', 'srp out': 'srp_out', 'giveaway': 'giveaway',
                'structure/upkeep': 'structure', 'office rental': 'office', 'tax': 'tax',
                'other': 'other'
            };
            const searchLower = categorySearch.toLowerCase();
            const matchingKey = categoryLabels[searchLower];

            if (matchingKey) {
                whereClauses.push('custom_category = ?');
                params.push(matchingKey);
            } else {
                // Fallback to LIKE search on the string
                whereClauses.push('custom_category LIKE ?');
                params.push(`%${categorySearch}%`);
            }
        }
    }
    // --- END CATEGORY SEARCH LOGIC ---


    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    try {
        // Aggregation: Monthly Income/Outcome by Category
        const monthlySql = `
            SELECT
                DATE_FORMAT(date, '%Y-%m') AS month,
                COALESCE(custom_category, 'uncategorized') AS category, -- Handle NULL categories
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS outcome -- Outcome will be negative or zero
            FROM corp_wallet_transactions
            ${whereString}
            GROUP BY month, category
            ORDER BY month ASC;
        `;
        const monthlyData = await db.query(monthlySql, params);

        // Aggregation: Current Balance per Division
        // This query should *not* be filtered by date or category, it should always show the *latest* balance.
        // It *should* be filtered by division if a division filter is active.
        const balanceWhereClauses = ['corporation_id = ?'];
        const balanceParams = [corporationId];
        if (divisionFilterParams.length > 0) {
            balanceWhereClauses.push(`division IN (${divisionFilterParams.map(() => '?').join(',')})`);
            balanceParams.push(...divisionFilterParams);
        }

        const balanceSql = `
           SELECT t1.division, t1.balance
           FROM corp_wallet_transactions t1
           INNER JOIN (
               SELECT division, MAX(transaction_id) AS max_tx_id
               FROM corp_wallet_transactions
               WHERE ${balanceWhereClauses.join(' AND ')}
               GROUP BY division
           ) t2 ON t1.division = t2.division AND t1.transaction_id = t2.max_tx_id;
        `;
        const balanceData = await db.query(balanceSql, balanceParams);


        // Aggregation: Totals by Category (Respects all filters)
        const categorySql = `
            SELECT
                COALESCE(custom_category, 'uncategorized') AS category,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS total_outcome
            FROM corp_wallet_transactions
             ${whereString}
            GROUP BY category;
        `;
        const categoryData = await db.query(categorySql, params);

        return {
            monthly: monthlyData,
            balances: balanceData,
            categories: categoryData
        };

    } catch (error) {
        logger.error('[WalletMonitor] Error fetching aggregated wallet data:', error);
        throw error; // Re-throw to be handled by the controller
    }
}


/**
 * Updates the custom category for a specific transaction.
 * @param {string} transactionIdStr - The transaction ID (as a string, potentially large).
 * @param {string|null} category - The new category ('srp_in', 'srp_out', etc.) or null to clear.
 * @returns {Promise<boolean>} Success status.
 */
async function updateTransactionCategory(transactionIdStr, category) {
    // List of valid categories, including null for clearing
    const validCategories = ['srp_in', 'srp_out', 'giveaway', 'structure', 'office', 'tax', 'other', null];

    // Validate the provided category
    if (!validCategories.includes(category)) {
        logger.warn(`[WalletMonitor] Invalid category provided for update: "${category}" for transaction ID: ${transactionIdStr}`);
        return false; // Return false if the category is not valid
    }

    try {
        // SQL query to update the custom_category field
        const sql = 'UPDATE corp_wallet_transactions SET custom_category = ? WHERE transaction_id = ?';
        // Execute the query using the pool for safety (prevents SQL injection)
        const [result] = await db.pool.query(sql, [category, transactionIdStr]);

        // Check if any row was actually updated
        const success = result.affectedRows > 0;
        if (success) {
            logger.info(`[WalletMonitor] Updated category for transaction ${transactionIdStr} to "${category || 'NULL'}".`);
        } else {
            logger.warn(`[WalletMonitor] No transaction found with ID ${transactionIdStr} to update category.`);
        }
        return success; // Return true if update was successful, false otherwise

    } catch (error) {
        // Log any database errors encountered during the update
        logger.error(`[WalletMonitor] Error updating category for transaction ${transactionIdStr}:`, error);
        return false; // Return false on error
    }
}


module.exports = {
    initializeLastTransactionIds,
    syncWalletTransactions,
    getTransactions,
    getAggregatedData,
    updateTransactionCategory,
};

