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
        const { metrics } = fleetData;

        const logData = {
            discordId: tokenData.user.id,
            commanderName: commanderName,
            fleetTimestamp: new Date(metrics.logStart),
            durationMinutes: Math.round(metrics.durationMinutes),
            totalIsk: metrics.totalFleetIncome,
            iskPerHour: metrics.totalIskRate, // This is total fleet isk/hr
            pilotCount: metrics.avgUserAlts,
            sitesRun: metrics.sitesRun,
            journalData: journalData,
        };

        const result = await iskManager.addLog(logData);

        if (result.success) {
            res.json({ success: true, message: 'Fleet log successfully submitted!' });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        logger.error('Error processing ISK log submission:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};
