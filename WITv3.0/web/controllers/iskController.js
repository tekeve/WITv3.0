const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');
const iskManager = require('@helpers/iskManager');
const charManager = require('@helpers/characterManager');

const showIskForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeIskTokens.delete(token);
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This ISK tracker link is invalid or has expired.' });
    }

    try {
        const isCommander = roleManager.hasPermission(tokenData.member, ['commander']);
        const charData = await charManager.getChars(tokenData.user.id);
        const commanderName = charData?.main?.character_name || tokenData.user.tag;

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

const showIskStats = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeIskTokens.delete(token);
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This ISK stats link is invalid or has expired.' });
    }

    try {
        if (!roleManager.hasPermission(tokenData.member, ['commander'])) {
            return res.status(403).render('error', { title: 'Permission Denied', message: 'You do not have permission to view this page.' });
        }

        const page = parseInt(req.query.page, 10) || 1;

        const [statsResult, fleetsResult] = await Promise.all([
            iskManager.getStats(),
            iskManager.getPaginatedFleets(page)
        ]);

        if (!statsResult.success || !fleetsResult.success) {
            const message = statsResult.message || fleetsResult.message || 'Could not fetch all required data.';
            return res.status(500).render('error', { title: 'Database Error', message });
        }

        res.render('iskStats', {
            token,
            currentUserId: tokenData.user.id,
            isLeadership: roleManager.isLeadershipOrHigher(tokenData.member),
            stats: statsResult.data,
            fleetData: fleetsResult.data,
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

const handleLogSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link.' });
    }

    if (!roleManager.hasPermission(tokenData.member, ['commander'])) {
        return res.status(403).json({ success: false, message: 'You do not have permission to submit logs.' });
    }

    try {
        const { fleets, commanderName } = req.body;
        if (!fleets || !Array.isArray(fleets)) {
            return res.status(400).json({ success: false, message: 'Invalid data format: expected a "fleets" array.' });
        }

        const results = [];
        for (const fleet of fleets) {
            if (!fleet || !fleet.metrics) {
                logger.warn('Skipping invalid fleet object in submission.');
                continue;
            }

            const { metrics } = fleet;
            const sanitizeNumber = (value) => {
                if (value === undefined || value === null) return null;
                const num = Number(value);
                return (isNaN(num) || !isFinite(num)) ? null : num;
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
                journalData: JSON.stringify(fleet.payouts) || null,
            };

            if (isNaN(logData.fleetTimestamp.getTime())) {
                logger.error(`ISK log submission failed due to invalid logStart date: ${metrics.logStart}`);
                results.push({ success: false, message: 'Invalid fleet start time provided for one or more fleets.' });
                continue;
            }

            const result = await iskManager.addLog(logData);
            results.push(result);
        }

        const successfulSubmissions = results.filter(r => r.success).length;
        const failedSubmissions = results.length - successfulSubmissions;

        res.json({
            success: failedSubmissions === 0,
            message: `Submission complete. ${successfulSubmissions} fleets logged. ${failedSubmissions} duplicates skipped.`
        });

    } catch (error) {
        logger.error('Error processing ISK log submission:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

const handleLogDeletion = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link.' });
    }

    try {
        const logId = parseInt(req.body.logId, 10);

        if (isNaN(logId)) {
            return res.status(400).json({ success: false, message: 'Invalid Log ID provided.' });
        }

        const result = await iskManager.deleteLog(logId, tokenData.member);

        let statusCode = 200;
        if (!result.success) {
            if (result.message.includes('permission')) {
                statusCode = 403; // Forbidden
            } else if (result.message.includes('not found')) {
                statusCode = 404; // Not Found
            } else {
                statusCode = 500; // Internal Server Error
            }
        }
        res.status(statusCode).json(result);

    } catch (error) {
        logger.error('Error processing ISK log deletion:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

const getFleetLogsPage = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired.' });
    }

    try {
        const page = parseInt(req.query.page, 10) || 1;
        const result = await iskManager.getPaginatedFleets(page);
        res.json(result);
    } catch (error) {
        logger.error('Error fetching paginated fleet data:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

const getFullStats = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeIskTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ success: false, message: 'Session expired.' });
    }
    try {
        const statsResult = await iskManager.getStats();
        res.json(statsResult);
    } catch (error) {
        logger.error('Error fetching full stats data:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};


module.exports = {
    showIskForm,
    showIskStats,
    handleLogSubmission,
    handleLogDeletion,
    getFleetLogsPage,
    getFullStats,
};

