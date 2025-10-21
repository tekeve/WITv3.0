const logger = require('@helpers/logger');
const { parseLog } = require('@helpers/combatLogParser');

/**
 * Renders the Combat Log Analysis form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showLogAnalysisForm = (client) => (req, res) => {
    res.render('logAnalysisForm');
};

/**
 * Handles the submission of raw log data for parsing and analysis.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleLogSubmission = (client) => async (req, res) => {
    const { rawLog } = req.body;
    if (!rawLog) {
        return res.status(400).json({ success: false, message: 'No log data provided.' });
    }

    try {
        const parsedLogs = parseLog(rawLog);

        if (parsedLogs.length === 0) {
            return res.json({ success: true, message: 'No combat entries found.', parsedLogs: [] });
        }

        // The server's only job is to parse the log and send the structured data back.
        res.json({ success: true, parsedLogs });

    } catch (error) {
        logger.error('Error handling log submission:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred while parsing the log.' });
    }
};

