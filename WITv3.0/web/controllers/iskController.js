const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');
const iskManager = require('@helpers/iskManager');
const charManager = require('@helpers/characterManager');


/**
 * Renders the ISK Tracker form page if the provided token is valid.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showIskForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    // Validate the token
    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) {
            // Clean up expired token
            client.activeIskTokens.delete(token);
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This ISK tracker link is invalid or has expired.' });
    }

    try {
        const isCommander = roleManager.hasPermission(tokenData.member, ['commander']);
        const charData = await charManager.getChars(tokenData.user.id);
        const commanderName = charData?.main?.character_name || tokenData.user.tag;

        // Render the EJS view, passing necessary data
        res.render('iskForm', {
            token,
            user: tokenData.user,
            isCommander: isCommander,
            commanderName: commanderName,
        });
    } catch (error) {
        logger.error('Error preparing ISK tracker page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load the ISK tracker page.' });
    }
};

/**
 * Renders the ISK Statistics page if the token is valid.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showIskStats = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    // Validate the token
    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) {
            client.activeIskTokens.delete(token);
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This ISK stats link is invalid or has expired.' });
    }

    try {
        // Permission check
        if (!roleManager.hasPermission(tokenData.member, ['commander'])) {
            return res.status(403).render('error', { title: 'Permission Denied', message: 'You do not have permission to view this page.' });
        }

        const statsResult = await iskManager.getStats();

        if (!statsResult.success) {
            return res.status(500).render('error', { title: 'Database Error', message: statsResult.message });
        }

        res.render('iskStats', {
            stats: statsResult.data,
            // Helper function to pass to the template for formatting numbers
            formatIsk: (value) => {
                if (value === null || value === undefined || isNaN(value)) return 'N/A';
                const num = Number(value);
                if (num >= 1e9) return `${(num / 1e9).toFixed(2)}b`;
                if (num >= 1e6) return `${(num / 1e6).toFixed(2)}m`;
                if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
                return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
            }
        });

    } catch (error) {
        logger.error('Error preparing ISK stats page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load the ISK statistics page.' });
    }
};

/**
 * Handles the submission of an ISK log from commanders.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleLogSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link.' });
    }

    if (!roleManager.hasPermission(tokenData.member, ['commander'])) {
        return res.status(403).json({ success: false, message: 'You do not have permission to submit logs.' });
    }

    try {
        const { fleetData, journalData, commanderName } = req.body;

        // Defensive check: Ensure fleetData and metrics exist
        if (!fleetData || !fleetData.metrics) {
            logger.error('ISK log submission failed: fleetData or metrics object was missing from the request body.');
            return res.status(400).json({ success: false, message: 'Invalid data submitted. The fleet metrics object is missing.' });
        }

        const { metrics } = fleetData;

        // Helper to ensure values passed to the database are valid numbers or null
        const sanitizeNumber = (value) => {
            // Check for undefined, null
            if (value === undefined || value === null) {
                return null;
            }
            const num = Number(value);
            // Check for NaN, Infinity, -Infinity
            if (isNaN(num) || !isFinite(num)) {
                return null;
            }
            return num;
        };

        const logData = {
            discordId: tokenData.user.id,
            commanderName: commanderName || 'Unknown Commander',
            fleetTimestamp: new Date(metrics.logStart),
            durationMinutes: Math.round(sanitizeNumber(metrics.durationMinutes) ?? 0),
            totalIsk: sanitizeNumber(metrics.totalFleetIncome),
            iskPerHour: sanitizeNumber(metrics.totalIskRate),
            pilotCount: sanitizeNumber(metrics.avgUserAlts),
            sitesRun: sanitizeNumber(metrics.sitesRun),
            journalData: journalData || null, // Ensure journalData is null if missing, not undefined
        };

        // Final validation before sending to DB manager
        if (isNaN(logData.fleetTimestamp.getTime())) {
            logger.error(`ISK log submission failed due to invalid logStart date: ${metrics.logStart}`);
            return res.status(400).json({ success: false, message: 'Invalid fleet start time provided.' });
        }


        const result = await iskManager.addLog(logData);

        if (result.success) {
            res.json({ success: true, message: 'Fleet log successfully submitted!' });
        } else {
            // The manager already logged the specific DB error, so just send a generic message
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        // This will catch errors from destructuring (e.g., if req.body.fleetData is undefined)
        logger.error('Error processing ISK log submission:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

