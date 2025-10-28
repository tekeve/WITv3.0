const db = require('@helpers/database');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');
const authManager = require('@helpers/authManager');
const configManager = require('@helpers/configManager');
const charManager = require('@helpers/characterManager'); // To potentially get member names
const path = require('path'); // Added path for caller logging

// In-memory cache to store the last processed transaction ID for each corp/division
// Key: `${corporationId}-${division}`
// Value: BigInt(lastTransactionId)
const lastTransactionIdCache = new Map();
const SRP_PAYMENT_AMOUNT = 20000000; // Define the standard SRP amount

/**
 * Loads the last processed transaction IDs from the database on startup.
 * Now an explicitly exported async function.
 * @returns {Promise<void>}
 */
async function initializeLastTransactionIds() {
    logger.info('[WalletMonitor InitCache] Starting initialization...');
    try {
        const rows = await db.query(`
            SELECT corporation_id, division, MAX(transaction_id) as max_id
            FROM corp_wallet_transactions
            GROUP BY corporation_id, division
        `);
        logger.info(`[WalletMonitor InitCache] Fetched ${rows.length} rows from DB.`);
        lastTransactionIdCache.clear(); // Clear cache before repopulating
        rows.forEach(row => {
            const key = `${row.corporation_id}-${row.division}`;
            // Ensure max_id is treated as BigInt
            if (row.max_id !== null && row.max_id !== undefined) {
                try {
                    lastTransactionIdCache.set(key, BigInt(row.max_id));
                } catch (e) {
                    logger.error(`[WalletMonitor InitCache] Failed to parse max_id '${row.max_id}' as BigInt for ${key}.`);
                }
            } else {
                logger.warn(`[WalletMonitor InitCache] max_id is null for ${key}. Skipping.`);
            }
        });
        logger.success(`[WalletMonitor InitCache] Initialization complete. Cache size: ${lastTransactionIdCache.size}`);
    } catch (error) {
        logger.error('[WalletMonitor InitCache] Failed:', error);
        // Do not re-throw, allow the application to continue but log the failure.
    }
}


/**
 * Attempts to automatically categorize a transaction based on its details.
 * @param {object} transaction - The transaction object from ESI.
 * @param {number} corporationId - The ID of the corporation whose wallet is being monitored.
 * @returns {string|null} The category name ('srp_in', 'srp_out', 'giveaway', 'tax', 'internal_transfer', 'manual_change') or null.
 */
function autoCategorizeTransaction(transaction, corporationId) { // Added corporationId parameter
    const tolerance = 1; // Allow for slight rounding errors if needed

    // --- NEW: Check for Internal Transfer first ---
    // Ensure IDs are numbers before comparing
    const firstPartyIdNum = Number(transaction.first_party_id);
    const secondPartyIdNum = Number(transaction.second_party_id);
    const corpIdNum = Number(corporationId);

    if (firstPartyIdNum && secondPartyIdNum && corpIdNum &&
        firstPartyIdNum === corpIdNum && secondPartyIdNum === corpIdNum) {
        return 'internal_transfer';
    }
    // --- END Internal Transfer Check ---

    // Check for SRP Contribution (Incoming) - Includes exact multiples
    if (transaction.amount > 0) {
        const remainder = Math.abs(transaction.amount % SRP_PAYMENT_AMOUNT);
        if (remainder <= tolerance || Math.abs(remainder - SRP_PAYMENT_AMOUNT) <= tolerance) {
            const multiple = transaction.amount / SRP_PAYMENT_AMOUNT;
            if (Math.abs(multiple - Math.round(multiple)) * SRP_PAYMENT_AMOUNT <= tolerance) {
                return 'srp_in';
            }
        }
    }

    // Check for potential SRP Payout or Giveaway (Outgoing) - Requires specific reasons
    if (transaction.amount < 0 && transaction.reason) {
        const reasonLower = transaction.reason.toLowerCase();
        if (reasonLower.includes('srp payout') || reasonLower.includes('srp:')) {
            return 'srp_out';
        }
        if (reasonLower.includes('giveaway') || reasonLower.includes('prize')) {
            return 'giveaway';
        }
    }

    // Check ref_type for tax
    const refTypeLower = transaction.ref_type.toLowerCase();
    // ESI ref_type for corp taxes
    if (refTypeLower.includes('corporation tax') || refTypeLower.includes('transaction tax')) {
        return 'tax';
    }

    // Removed checks for 'structure' and 'office'
    // Default to 'manual_change' if no specific category matches
    return 'manual_change';
}

/**
 * Fetches names for IDs involved in a batch of transactions.
 * @param {Set<number>} ids - A set of character/corporation/alliance IDs.
 * @returns {Promise<Map<number, string>>} A map of ID to Name.
 */
async function fetchNamesForIds(ids) {
    const idArray = Array.from(ids).filter(id => id && id > 0);
    const namesMap = new Map();
    if (idArray.length === 0) return namesMap;

    try {
        const chunkSize = 1000;
        for (let i = 0; i < idArray.length; i += chunkSize) {
            const chunk = idArray.slice(i, i + chunkSize);
            const response = await esiService.post({ endpoint: '/universe/names/', data: chunk, caller: __filename });
            if (response && Array.isArray(response)) {
                response.forEach(item => namesMap.set(item.id, item.name));
            }
        }
    } catch (error) {
        logger.error('[WalletMonitor NameFetch] Failed:', error);
    }
    return namesMap;
}


/**
 * Fetches new wallet journal entries for a specific corporation division from ESI.
 * @param {number} corporationId - The EVE corporation ID.
 * @param {number} division - The wallet division number (1-7).
 * @param {string} accessToken - A valid ESI access token.
 * @param {bigint|null} [fromId=null] - Optional: Fetch transactions starting strictly after this ID.
 * @returns {Promise<{transactions: Array, earliestExpiry: number|null}>} Transactions and expiry time.
 */
async function fetchWalletJournalPage(corporationId, division, accessToken, fromId = null) {
    let allNewTransactions = [];
    let earliestExpiry = null;
    let page = 1;
    const maxPagesToFetch = 10; // Safety limit

    try {
        while (page <= maxPagesToFetch) {
            const endpoint = `/corporations/${corporationId}/wallets/${division}/journal/`;
            const response = await esiService.get({
                endpoint: endpoint,
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { page },
                caller: __filename
            });

            // Update earliest expiry time
            if (response.expires) {
                if (earliestExpiry === null || response.expires < earliestExpiry) {
                    earliestExpiry = response.expires;
                }
            }

            if (!response || !Array.isArray(response.data) || response.data.length === 0) {
                break; // No more data or invalid response
            }

            const transactionsOnPage = response.data;
            let reachedLastKnownId = false;

            const newTransactionsOnPage = transactionsOnPage.filter(t => {
                const currentId = BigInt(t.id);
                if (fromId !== null && currentId <= fromId) {
                    reachedLastKnownId = true;
                    return false;
                }
                return true;
            });


            allNewTransactions.push(...newTransactionsOnPage);

            if (reachedLastKnownId) {
                break; // Stop fetching if we found the last known ID
            }

            const pagesHeader = response.headers ? response.headers['x-pages'] : null;
            const totalPages = pagesHeader ? parseInt(pagesHeader, 10) : 1;
            if (page >= totalPages) {
                break; // Reached the last page according to ESI
            }

            page++;
        }
    } catch (error) {
        logger.error(`[WalletMonitor Fetch] Failed fetching journal page ${page} for Corp ${corporationId}, Div ${division}:`, error.message);
        throw error; // Re-throw to be handled by syncWalletTransactions
    }

    return { transactions: allNewTransactions.reverse(), earliestExpiry };
}


/**
 * Fetches, processes, and stores new wallet transactions. Called by the scheduler.
 * @returns {Promise<number>} The minimum delay in milliseconds until the next check.
 */
async function syncWalletTransactions() {
    logger.info('[WalletMonitor Sync] Starting wallet transaction sync...');
    const config = configManager.get();
    let overallEarliestExpiry = null; // Track the earliest expiry across all divisions

    const corporationIdStr = config.srpCorporationId?.[0];
    const divisionsToMonitorStr = config.srpWalletDivisions || [];

    if (!corporationIdStr) {
        logger.warn('[WalletMonitor Sync] srpCorporationId not configured. Skipping.');
        return 60 * 60 * 1000; // 1 hour delay
    }
    const corporationId = parseInt(corporationIdStr, 10);
    if (isNaN(corporationId)) {
        logger.warn(`[WalletMonitor Sync] Invalid srpCorporationId: "${corporationIdStr}". Skipping.`);
        return 60 * 60 * 1000;
    }

    const divisionsToMonitor = divisionsToMonitorStr
        .map(d => parseInt(d, 10))
        .filter(d => !isNaN(d) && d >= 1 && d <= 7);

    if (divisionsToMonitor.length === 0) {
        logger.warn('[WalletMonitor Sync] No valid srpWalletDivisions configured. Skipping.');
        return 60 * 60 * 1000;
    }

    const adminUsers = config.adminUsers || [];
    if (adminUsers.length === 0) {
        logger.error('[WalletMonitor Sync] No adminUsers configured. Cannot authenticate. Skipping.');
        return 60 * 60 * 1000;
    }
    const authDiscordId = adminUsers[0];

    const accessToken = await authManager.getAccessToken(authDiscordId);
    if (!accessToken) {
        logger.error(`[WalletMonitor Sync] Could not get ESI token for admin ${authDiscordId}. Skipping.`);
        return 5 * 60 * 1000; // Retry sooner
    }

    let totalNewTransactionsProcessed = 0;

    for (const division of divisionsToMonitor) {
        const cacheKey = `${corporationId}-${division}`;
        const lastKnownId = lastTransactionIdCache.get(cacheKey) || null;
        let highestProcessedIdThisSync = lastKnownId; // Track the newest ID found in this run
        let divisionEarliestExpiry = null;

        try {
            logger.info(`[WalletMonitor Sync Div ${division}] Starting sync. Last known ID from cache: ${lastKnownId || 'None'}.`);
            const { transactions: newTransactions, earliestExpiry } = await fetchWalletJournalPage(corporationId, division, accessToken, lastKnownId);

            divisionEarliestExpiry = earliestExpiry;
            if (divisionEarliestExpiry !== null) {
                if (overallEarliestExpiry === null || divisionEarliestExpiry < overallEarliestExpiry) {
                    overallEarliestExpiry = divisionEarliestExpiry;
                }
            } else {
                logger.info(`[WalletMonitor Sync Div ${division}] Fetched ${newTransactions.length} new txs. No ESI expiry header received.`);
            }

            if (newTransactions.length === 0) continue;

            const idsToFetchNamesFor = new Set();
            newTransactions.forEach(t => {
                if (t.first_party_id) idsToFetchNamesFor.add(t.first_party_id);
                if (t.second_party_id) idsToFetchNamesFor.add(t.second_party_id);
                if (t.tax_receiver_id) idsToFetchNamesFor.add(t.tax_receiver_id);
            });

            const namesMap = await fetchNamesForIds(idsToFetchNamesFor);
            const valuesToInsert = [];

            for (const t of newTransactions) {
                const currentId = BigInt(t.id);
                if (lastKnownId !== null && currentId <= lastKnownId) {
                    continue; // Skip already processed
                }

                const firstPartyName = namesMap.get(t.first_party_id) || null;
                const secondPartyName = namesMap.get(t.second_party_id) || null;
                const customCategory = autoCategorizeTransaction(t, corporationId); // Pass corp ID here

                valuesToInsert.push([
                    t.id.toString(), corporationId, division, new Date(t.date), t.ref_type,
                    t.first_party_id || null, firstPartyName, t.second_party_id || null, secondPartyName,
                    t.amount, t.balance, t.reason || null, t.tax_receiver_id || null, t.tax_amount || null,
                    t.context_id || null, t.context_type || null, t.description, customCategory
                ]);

                if (highestProcessedIdThisSync === null || currentId > highestProcessedIdThisSync) {
                    highestProcessedIdThisSync = currentId;
                }
            }

            if (valuesToInsert.length > 0) {
                logger.info(`[WalletMonitor Sync Div ${division}] Preparing to insert ${valuesToInsert.length} new transactions...`);
                const sql = `
                    INSERT IGNORE INTO corp_wallet_transactions (
                        transaction_id, corporation_id, division, date, ref_type,
                        first_party_id, first_party_name, second_party_id, second_party_name,
                        amount, balance, reason, tax_receiver_id, tax_amount,
                        context_id, context_type, description, custom_category
                    ) VALUES ?
                `;
                const [result] = await db.pool.query(sql, [valuesToInsert]);

                totalNewTransactionsProcessed += result.affectedRows;
                logger.info(`[WalletMonitor Sync Div ${division}] Insert result: Affected=${result.affectedRows}, Duplicates=${valuesToInsert.length - result.affectedRows}`);

                if (highestProcessedIdThisSync !== null && (lastKnownId === null || highestProcessedIdThisSync > lastKnownId)) {
                    lastTransactionIdCache.set(cacheKey, highestProcessedIdThisSync);
                    logger.info(`[WalletMonitor Sync Div ${division}] Cache updated. New last ID: ${highestProcessedIdThisSync}.`);
                } else if (result.affectedRows === 0 && highestProcessedIdThisSync !== null) {
                    if (lastKnownId === null || highestProcessedIdThisSync > lastKnownId) {
                        lastTransactionIdCache.set(cacheKey, highestProcessedIdThisSync);
                        logger.info(`[WalletMonitor Sync Div ${division}] No rows inserted (likely duplicates), but updated cache as highest ID seen (${highestProcessedIdThisSync}) is newer than cached (${lastKnownId}).`);
                    }
                }

            } else {
                logger.info(`[WalletMonitor Sync Div ${division}] No valid new transactions to insert after processing.`);
            }

        } catch (error) {
            logger.error(`[WalletMonitor Sync Div ${division}] Failed:`, error.message);
        }
    }

    // Calculate delay for next run
    let nextCheckDelayMs = 60 * 60 * 1000; // Default: 1 hour
    if (overallEarliestExpiry !== null) {
        const timeUntilExpiry = overallEarliestExpiry - Date.now();
        nextCheckDelayMs = Math.max(10000, Math.min(timeUntilExpiry + 1000, 60 * 60 * 1000));
        logger.info(`[WalletMonitor Sync] Earliest ESI cache expiry: ${new Date(overallEarliestExpiry).toLocaleTimeString()}.`);
    } else {
        logger.info(`[WalletMonitor Sync] No ESI expiry headers received, using default delay.`);
    }

    logger.success(`[WalletMonitor Sync] Finished. ${totalNewTransactionsProcessed} total inserted. Next check delay: ${Math.round(nextCheckDelayMs / 1000)}s.`);
    return nextCheckDelayMs; // Return the calculated delay
}


/**
 * Fetches transaction data based on filters for the web UI.
 * @param {object} filters - Filtering options.
 * @returns {Promise<object>} Object containing transactions and total count.
 */
async function getTransactions(filters = {}) {
    const {
        startDate, endDate, divisions = [], categorySearch,
        page = 1, limit = 50, // These now come validated from controller
        refType, partySearch, amountExact, reasonSearch
    } = filters;

    const numLimit = limit; // Already validated in controller
    const numPage = page; // Already validated in controller
    const numOffset = Math.max(0, (numPage - 1) * numLimit); // Ensure non-negative

    let whereClauses = [];
    let params = [];
    let dataSql = ''; // Declared outside try block

    const config = configManager.get();
    const corporationIdStr = config.srpCorporationId?.[0];
    if (!corporationIdStr) return { transactions: [], total: 0 };
    const corporationId = parseInt(corporationIdStr, 10);
    whereClauses.push('corporation_id = ?');
    params.push(corporationId);

    if (startDate) { whereClauses.push('date >= ?'); params.push(new Date(startDate)); }
    if (endDate) {
        const inclusiveEndDate = new Date(endDate);
        inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
        whereClauses.push('date < ?'); params.push(inclusiveEndDate);
    }

    if (Array.isArray(divisions) && divisions.length > 0) {
        const validDivisions = divisions.map(Number).filter(d => !isNaN(d));
        if (validDivisions.length > 0) {
            whereClauses.push(`division IN (${validDivisions.map(() => '?').join(',')})`);
            params.push(...validDivisions);
        }
    }

    // --- Updated Category Search Logic ---
    if (categorySearch) {
        const categoryLabels = { // Use NEW labels
            'SRP In': 'srp_in', 'SRP Out': 'srp_out', 'Giveaway': 'giveaway',
            'Internal Transfer': 'internal_transfer', 'Tax': 'tax', 'Manual Change': 'manual_change', 'Other': 'other'
        };
        const searchLower = categorySearch.toLowerCase();
        const matchingKey = Object.keys(categoryLabels).find(key => categoryLabels[key].toLowerCase() === searchLower);

        if (searchLower === 'uncategorized') {
            whereClauses.push('custom_category IS NULL');
        } else if (matchingKey) {
            whereClauses.push('custom_category = ?'); params.push(matchingKey);
        } else { // Fallback fuzzy search if no exact label match
            whereClauses.push('custom_category LIKE ?'); params.push(`%${categorySearch}%`);
        }
    }
    // --- End Updated Category Search Logic ---


    if (refType) { whereClauses.push('ref_type LIKE ?'); params.push(`%${refType}%`); }
    if (partySearch) { whereClauses.push('(first_party_name LIKE ? OR second_party_name LIKE ?)'); params.push(`%${partySearch}%`, `%${partySearch}%`); }
    const exactAmount = Number(amountExact);
    if (amountExact !== null && amountExact !== undefined && !isNaN(exactAmount)) {
        whereClauses.push('(amount = ? OR amount = ?)'); params.push(exactAmount, -exactAmount);
    }
    if (reasonSearch) { whereClauses.push('(reason LIKE ? OR description LIKE ?)'); params.push(`%${reasonSearch}%`, `%${reasonSearch}%`); }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const limitInt = Math.max(0, Math.floor(numLimit));
    const offsetInt = Math.max(0, Math.floor(numOffset));

    const countSql = `SELECT COUNT(*) as total FROM corp_wallet_transactions ${whereString}`;
    dataSql = `
        SELECT * FROM corp_wallet_transactions ${whereString}
        ORDER BY date DESC, transaction_id DESC LIMIT ${limitInt} OFFSET ${offsetInt}`;

    const finalParams = [...params];

    try {
        const [countResult] = await db.query(countSql, finalParams);
        const total = countResult ? countResult.total : 0;

        const transactions = await db.query(dataSql, finalParams); // Pass only filter params

        return { transactions, total, currentPage: numPage, totalPages: Math.ceil(total / limitInt) };

    } catch (error) {
        logger.error('[WalletMonitor Web] Error fetching transactions. Query:\n' + dataSql);
        logger.error('[WalletMonitor Web] Parameters:', finalParams);
        logger.error('[WalletMonitor Web]', error); // Log the full error object
        throw error;
    }
}

/**
* Fetches aggregated wallet data for charts/summaries based on filters.
* @param {object} filters - Filtering options.
* @returns {Promise<object>} Aggregated data.
*/
async function getAggregatedData(filters = {}) {
    const { startDate, endDate, divisions = [], categorySearch } = filters;
    let baseWhereClauses = [];
    let baseParams = [];
    let payerBaseWhereClauses = ['amount > 0', 'custom_category = ?']; // Start payer queries filtered to srp_in
    let payerBaseParams = ['srp_in'];

    const config = configManager.get();
    const corporationIdStr = config.srpCorporationId?.[0];
    if (!corporationIdStr) return {};
    const corporationId = parseInt(corporationIdStr, 10);

    baseWhereClauses.push('corporation_id = ?'); baseParams.push(corporationId);
    payerBaseWhereClauses.push('corporation_id = ?'); payerBaseParams.push(corporationId);

    if (startDate) {
        const start = new Date(startDate);
        baseWhereClauses.push('date >= ?'); baseParams.push(start);
        payerBaseWhereClauses.push('date >= ?'); payerBaseParams.push(start);
    }
    if (endDate) {
        const end = new Date(endDate); end.setDate(end.getDate() + 1);
        baseWhereClauses.push('date < ?'); baseParams.push(end);
        payerBaseWhereClauses.push('date < ?'); payerBaseParams.push(end);
    }

    let divisionFilterParams = [];
    if (Array.isArray(divisions) && divisions.length > 0) {
        const validDivisions = divisions.map(Number).filter(d => !isNaN(d));
        if (validDivisions.length > 0) {
            const placeholders = validDivisions.map(() => '?').join(',');
            baseWhereClauses.push(`division IN (${placeholders})`); baseParams.push(...validDivisions);
            payerBaseWhereClauses.push(`division IN (${placeholders})`); payerBaseParams.push(...validDivisions);
            divisionFilterParams = validDivisions;
        }
    }

    // --- Updated Category Search Logic for Aggregation ---
    if (categorySearch) {
        const categoryLabels = {
            'SRP In': 'srp_in', 'SRP Out': 'srp_out', 'Giveaway': 'giveaway',
            'Internal Transfer': 'internal_transfer', 'Tax': 'tax', 'Manual Change': 'manual_change', 'Other': 'other'
        };
        const searchLower = categorySearch.toLowerCase();
        const matchingKey = Object.keys(categoryLabels).find(key => categoryLabels[key].toLowerCase() === searchLower);
        let categoryClause = '', categoryParam = '';

        if (searchLower === 'uncategorized') {
            categoryClause = 'custom_category IS NULL';
        } else if (matchingKey) {
            categoryClause = 'custom_category = ?'; categoryParam = matchingKey;
        } else {
            categoryClause = 'custom_category LIKE ?'; categoryParam = `%${categorySearch}%`;
        }
        if (categoryClause) {
            baseWhereClauses.push(categoryClause); if (categoryParam) baseParams.push(categoryParam);
            // Payer queries are already filtered to 'srp_in', only apply additional filters if relevant
            if (categoryParam !== 'srp_in' && searchLower !== 'uncategorized') {
                payerBaseWhereClauses.push('1=0'); // Make payer query return nothing
            }
        }
    }
    // --- End Updated Category Search Logic for Aggregation ---


    const whereString = baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';
    const payerWhereString = payerBaseWhereClauses.length > 0 ? `WHERE ${payerBaseWhereClauses.join(' AND ')}` : '';

    try {
        const monthlySql = `SELECT DATE_FORMAT(date, '%Y-%m') AS month, COALESCE(custom_category, 'uncategorized') AS category, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income, SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS outcome FROM corp_wallet_transactions ${whereString} GROUP BY month, category ORDER BY month ASC;`;

        const balanceWhereClausesForQuery = ['corporation_id = ?'];
        const balanceParamsForQuery = [corporationId];
        if (divisionFilterParams.length > 0) {
            balanceWhereClausesForQuery.push(`division IN (${divisionFilterParams.map(() => '?').join(',')})`);
            balanceParamsForQuery.push(...divisionFilterParams);
        }
        const balanceSql = `
           SELECT t1.division, t1.balance
           FROM corp_wallet_transactions t1
           INNER JOIN (
               SELECT division, MAX(transaction_id) AS max_tx_id
               FROM corp_wallet_transactions
               WHERE ${balanceWhereClausesForQuery.join(' AND ')}
               GROUP BY division
           ) t2 ON t1.division = t2.division AND t1.transaction_id = t2.max_tx_id;`;

        const categorySql = `SELECT COALESCE(custom_category, 'uncategorized') AS category, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_income, SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS total_outcome FROM corp_wallet_transactions ${whereString} GROUP BY category;`;

        const topPayersByCountSql = `
            SELECT
                COALESCE(first_party_name, 'Unknown Payer') as commander_name,
                SUM(
                    CASE
                        WHEN amount > 0 AND CAST(amount AS DECIMAL(20,2)) % ${SRP_PAYMENT_AMOUNT} = 0
                        THEN FLOOR(CAST(amount AS DECIMAL(20,2)) / ${SRP_PAYMENT_AMOUNT})
                        ELSE 1
                    END
                ) AS transaction_count
            FROM corp_wallet_transactions
            ${payerWhereString}
            GROUP BY commander_name
            ORDER BY transaction_count DESC
            LIMIT 5;`;

        const topPayersByAmountSql = `SELECT COALESCE(first_party_name, 'Unknown Payer') as commander_name, SUM(amount) AS total_amount FROM corp_wallet_transactions ${payerWhereString} GROUP BY commander_name ORDER BY total_amount DESC LIMIT 5;`;

        const [
            monthlyData,
            balanceResult,
            categoryData,
            topPayersByCount,
            topPayersByAmount,
            top5PayersResult
        ] = await Promise.all([
            db.query(monthlySql, baseParams),
            db.query(balanceSql, balanceParamsForQuery),
            db.query(categorySql, baseParams),
            db.query(topPayersByCountSql, payerBaseParams),
            db.query(topPayersByAmountSql, payerBaseParams),
            db.query(topPayersByAmountSql, payerBaseParams) // Fetch top 5 for history based on amount
        ]);

        const topPayerNames = top5PayersResult.map(p => p.commander_name || 'Unknown Payer').filter(Boolean);

        let payerIncomeOverTimeSql = 'SELECT CURDATE() as date, "No Payers Found" as first_party_name, 0 as daily_total_income';
        let payerIncomeParams = [];
        if (topPayerNames.length > 0) {
            const namePlaceholders = topPayerNames.map(() => '?').join(',');
            const historyWhereClauses = ['corporation_id = ?', 'amount > 0', 'custom_category = ?', `COALESCE(first_party_name, 'Unknown Payer') IN (${namePlaceholders})`];
            const historyParams = [corporationId, 'srp_in', ...topPayerNames];
            if (startDate) { historyWhereClauses.push('date >= ?'); historyParams.push(new Date(startDate)); }
            if (endDate) { const endHist = new Date(endDate); endHist.setDate(endHist.getDate() + 1); historyWhereClauses.push('date < ?'); historyParams.push(endHist); }
            if (divisionFilterParams.length > 0) { historyWhereClauses.push(`division IN (${divisionFilterParams.map(() => '?').join(',')})`); historyParams.push(...divisionFilterParams); }

            payerIncomeOverTimeSql = `SELECT DATE(date) as date, COALESCE(first_party_name, 'Unknown Payer') as first_party_name, SUM(amount) AS daily_total_income FROM corp_wallet_transactions WHERE ${historyWhereClauses.join(' AND ')} GROUP BY DATE(date), COALESCE(first_party_name, 'Unknown Payer') ORDER BY date ASC;`;
            payerIncomeParams = historyParams;
        }

        const payerIncomeOverTimeRaw = await db.query(payerIncomeOverTimeSql, payerIncomeParams);
        const payerIncomeOverTime = (payerIncomeOverTimeRaw.length === 1 && payerIncomeOverTimeRaw[0].first_party_name === "No Payers Found") ? [] : payerIncomeOverTimeRaw;

        return {
            monthly: monthlyData, balances: balanceResult, categories: categoryData,
            topPayersByCount: topPayersByCount, topPayersByAmount: topPayersByAmount,
            payerIncomeOverTime: payerIncomeOverTime
        };

    } catch (error) {
        logger.error('[WalletMonitor Web] Error fetching aggregated data:', error);
        throw error;
    }
}


/**
 * Updates the custom category for a specific transaction.
 * @param {string} transactionIdStr - The transaction ID.
 * @param {string|null} category - The new category or null.
 * @returns {Promise<boolean>} Success status.
 */
async function updateTransactionCategory(transactionIdStr, category) {
    // --- Updated valid categories list ---
    // Added 'other' to allow explicit selection by user
    const validCategories = ['srp_in', 'srp_out', 'giveaway', 'tax', 'internal_transfer', 'manual_change', 'other', null];
    // --- End Update ---

    if (!validCategories.includes(category)) {
        logger.warn(`[WalletMonitor UpdateCat] Invalid category: "${category}" for tx ${transactionIdStr}`);
        return false;
    }
    try {
        const sql = 'UPDATE corp_wallet_transactions SET custom_category = ? WHERE transaction_id = ?';
        const [result] = await db.pool.query(sql, [category, transactionIdStr]);
        const success = result.affectedRows > 0;
        if (success) {
            logger.info(`[WalletMonitor UpdateCat] Tx ${transactionIdStr} category updated to "${category || 'NULL'}".`);
        } else {
            logger.warn(`[WalletMonitor UpdateCat] Tx ${transactionIdStr} not found for update.`);
        }
        return success;
    } catch (error) {
        logger.error(`[WalletMonitor UpdateCat] Error for tx ${transactionIdStr}:`, error);
        return false;
    }
}


module.exports = {
    initializeLastTransactionIds,
    syncWalletTransactions,
    getTransactions,
    getAggregatedData,
    updateTransactionCategory,
};
