const logger = require('@helpers/logger');
const walletMonitor = require('@helpers/walletMonitor');
const roleManager = require('@helpers/roleManager');

// Permissions required to view the page at all
const VIEW_PERMISSION = ['council', 'admin'];
// Permissions required to edit categories
const EDIT_PERMISSION = ['leadership', 'admin'];

/**
 * Middleware to validate the token and user permissions for wallet routes.
 */
const validateWalletToken = (client, requiredPermissions = VIEW_PERMISSION) => async (req, res, next) => {
    const { token } = req.params;
    const tokenData = client.activeWalletTokens?.get(token);
    // logger.info(`[WalletController] Validating token: ${token}`); // Removed log

    if (!tokenData || Date.now() > tokenData.expires) {
        if (client.activeWalletTokens?.has(token)) {
            client.activeWalletTokens.delete(token);
        }
        logger.warn(`[WalletController] Invalid or expired token: ${token}`);
        if (req.path.includes('/api/')) {
            return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link in Discord.' });
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This link is invalid or has expired.' });
    }

    // Fetch member object using stored guildId
    try {
        const guild = await client.guilds.fetch(tokenData.guildId);
        if (!guild) {
            logger.error(`[WalletController] Could not fetch guild with ID: ${tokenData.guildId}`);
            throw new Error('Guild not found');
        }
        const member = await guild.members.fetch(tokenData.user.id);
        if (!member) {
            logger.error(`[WalletController] Could not fetch member with ID: ${tokenData.user.id} in guild ${tokenData.guildId}`);
            throw new Error('Member not found in guild');
        }
        tokenData.member = member; // Add member object to tokenData for later use
        // logger.info(`[WalletController] Fetched member: ${member.user.tag}`); // Removed log

    } catch (error) {
        logger.error(`[WalletController] Error fetching guild or member during token validation:`, error);
        if (req.path.includes('/api/')) {
            return res.status(500).json({ success: false, message: 'Could not verify user guild membership.' });
        }
        return res.status(500).render('error', { title: 'Server Error', message: 'Could not verify your membership in the server.' });
    }


    const permissionsToCheck = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    // logger.info(`[WalletController] Checking permissions for ${tokenData.member.user.tag}: requires ${permissionsToCheck.join(' or ')}`); // Removed log

    if (!roleManager.hasPermission(tokenData.member, permissionsToCheck)) {
        logger.warn(`[WalletController] Permission denied for ${tokenData.member.user.tag}. Required: ${permissionsToCheck.join(' or ')}`);
        if (req.path.includes('/api/')) {
            return res.status(402).json({ success: false, message: 'You do not have permission for this action.' });
        }
        return res.status(403).render('error', { title: 'Permission Denied', message: `You do not have the required role to access this page.` });
    }

    // logger.info(`[WalletController] Permissions validated successfully for ${tokenData.member.user.tag}`); // Removed log
    req.tokenData = tokenData; // Attach validated data to request
    next();
};

/**
 * Renders the Wallet Monitor page. Fetches initial aggregated data.
 */
exports.showMonitor = (client) => [
    validateWalletToken(client, VIEW_PERMISSION), // Use VIEW_PERMISSION for page access
    async (req, res) => {
        const { token } = req.params;
        const { member } = req.tokenData;
        const canEditCategories = roleManager.hasPermission(member, EDIT_PERMISSION);

        try {
            logger.info(`[WalletController] Rendering walletMonitor.ejs for ${member.user.tag}`);
            // Fetch initial aggregated data (e.g., current balances, maybe last month's summary)
            // We'll let the frontend fetch transaction data via API to keep initial load faster.
            let initialAggregatedData = {};
            try {
                // Fetch for the current month by default initially
                const today = new Date();
                const year = today.getFullYear();
                const month = today.getMonth();
                const firstDayOfMonth = new Date(year, month, 1);
                const lastDayOfMonth = new Date(year, month + 1, 0); // Day 0 of next month

                // By default, we select all divisions and categories for the initial aggregated data
                const defaultDivisions = [1, 2, 3, 4, 5, 6, 7];
                // categorySearch is null by default, which means no category filter is applied

                initialAggregatedData = await walletMonitor.getAggregatedData({
                    startDate: firstDayOfMonth.toISOString().split('T')[0], // YYYY-MM-DD
                    endDate: lastDayOfMonth.toISOString().split('T')[0], // YYYY-MM-DD
                    divisions: defaultDivisions,
                    categorySearch: null // No text filter on category by default
                }) || {}; // Ensure it's an object even if null/error occurs
                logger.info(`[WalletController] Initial aggregated data fetched for ${member.user.tag}.`);

            } catch (aggError) {
                logger.error('[WalletController] Error fetching initial aggregated data for page load:', aggError);
                // Don't fail the page load, just render with empty data
                initialAggregatedData = { monthly: [], balances: [], categories: [] };
            }

            res.render('walletMonitor', {
                token,
                canEdit: canEditCategories, // Pass permission flag to the template
                // Pass initially fetched aggregated data (or empty object)
                initialAggregatedData: initialAggregatedData
            });
            logger.info(`[WalletController] Successfully rendered walletMonitor.ejs for ${member.user.tag}.`);
        } catch (error) {
            logger.error('[WalletController] Error rendering wallet monitor page:', error);
            res.status(500).render('error', { title: 'Server Error', message: 'Could not load the wallet monitor page.' });
        }
    }
];

/**
 * API Endpoint: Fetches paginated transaction data based on filters.
 */
exports.getTransactionsData = (client) => [
    validateWalletToken(client, VIEW_PERMISSION), // Ensure user still has view permission
    async (req, res) => {
        const { member } = req.tokenData;
        try {
            // Filters from POST body (preferred for complex/many filters)
            const {
                startDate, endDate, divisions, page, limit, // Remove default values here, handle below
                refType, partySearch, amountExact, reasonSearch,
                categorySearch // Added categorySearch
            } = req.body;

            // --- Robust Parsing and Defaulting ---
            const pageNum = parseInt(page, 10);
            const limitNum = parseInt(limit, 10);
            const finalPage = (!isNaN(pageNum) && pageNum > 0) ? pageNum : 1;
            const finalLimit = (!isNaN(limitNum) && limitNum > 0) ? limitNum : 50;
            // --- End Parsing ---

            // Removed detailed filter log
            // logger.info(`[WalletController] Fetching transactions for ${member.user.tag} with filters:`, req.body);

            const filters = {
                startDate, endDate, divisions,
                page: finalPage, // Use validated page
                limit: finalLimit, // Use validated limit
                refType, partySearch, amountExact, reasonSearch,
                categorySearch // Pass new filter
            };
            const data = await walletMonitor.getTransactions(filters);

            res.json({ success: true, ...data });
            logger.info(`[WalletController] Successfully served transactions page ${finalPage} to ${member.user.tag}.`);

        } catch (error) {
            logger.error('[WalletController] Error fetching transaction data:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch transaction data.' });
        }
    }
];


/**
 * API Endpoint: Fetches aggregated wallet data (summaries, chart data) based on filters.
 */
exports.getAggregatedWalletData = (client) => [
    validateWalletToken(client, VIEW_PERMISSION), // Ensure user still has view permission
    async (req, res) => {
        const { member } = req.tokenData;
        try {
            // Filters from POST body
            const { startDate, endDate, divisions, categorySearch } = req.body; // Add categorySearch
            // Removed detailed filter log
            // logger.info(`[WalletController] Fetching aggregated data for ${member.user.tag} with filters:`, req.body);

            // Pass all relevant filters to the aggregation function
            const filters = { startDate, endDate, divisions, categorySearch };
            const aggregatedData = await walletMonitor.getAggregatedData(filters);

            res.json({ success: true, data: aggregatedData });
            logger.info(`[WalletController] Successfully served aggregated data to ${member.user.tag}.`);

        } catch (error) {
            logger.error('[WalletController] Error fetching aggregated wallet data:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch aggregated wallet data.' });
        }
    }
];

/**
 * API Endpoint: Updates the category of a transaction.
 */
exports.updateCategory = (client) => [
    validateWalletToken(client, EDIT_PERMISSION), // Use EDIT_PERMISSION for this action
    async (req, res) => {
        const { member } = req.tokenData;
        const io = req.app.get('io'); // Get Socket.IO instance

        try {
            const { transactionId, category } = req.body;
            logger.info(`[WalletController] User ${member.user.tag} attempting to update category for tx ${transactionId} to ${category}`);

            if (!transactionId || category === undefined) { // Allow category to be null explicitly
                return res.status(400).json({ success: false, message: 'Missing transaction ID or category.' });
            }

            // --- Updated valid categories list ---
            // Added 'other' to allow explicit selection
            const validCategories = ['srp_in', 'srp_out', 'giveaway', 'tax', 'internal_transfer', 'manual_change', 'other', null];
            if (!validCategories.includes(category)) {
                logger.warn(`[WalletController UpdateCat] Invalid category provided: "${category}" for tx ${transactionId}`);
                return res.status(400).json({ success: false, message: `Invalid category specified: "${category}".` });
            }
            // --- End Update ---


            const success = await walletMonitor.updateTransactionCategory(transactionId, category);

            if (success) {
                // Emit event to all connected clients on success
                io.emit('wallet-update');
                logger.info(`[WalletController] Category update successful for tx ${transactionId}, emitting wallet-update.`);
                res.json({ success: true, message: 'Category updated successfully.' });
            } else {
                logger.warn(`[WalletController] Failed to update category for tx ${transactionId}.`);
                res.status(400).json({ success: false, message: 'Failed to update category. Transaction ID might be invalid or category value incorrect.' });
            }
        } catch (error) {
            logger.error('[WalletController] Error updating transaction category:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred while updating the category.' });
        }
    }
];

