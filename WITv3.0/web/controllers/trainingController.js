const logger = require('@helpers/logger');
const trainingManager = require('@helpers/trainingManager');
const roleManager = require('@helpers/roleManager');
const charManager = require('@helpers/characterManager');
const { syncLogiStatus } = require('@helpers/trainingSyncManager');

/**
 * Middleware to validate the token and user permissions for all training routes.
 */
const validateTokenAndPermissions = (client, requiredPermission = 'commander') => (req, res, next) => {
    const { token } = req.params;
    const tokenData = client.activeTrainingTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (client.activeTrainingTokens?.has(token)) {
            client.activeTrainingTokens.delete(token);
        }
        if (req.path.includes('/api/')) {
            return res.status(403).json({ success: false, message: 'Session expired. Please generate a new link in Discord.' });
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This link is invalid or has expired.' });
    }

    if (!roleManager.hasPermission(tokenData.member, [requiredPermission, 'admin'])) {
        if (req.path.includes('/api/')) {
            return res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
        }
        return res.status(403).render('error', { title: 'Permission Denied', message: `You do not have the required role to access this page.` });
    }

    req.tokenData = tokenData;
    next();
};


/**
 * Renders the Commander Training Tracker page.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showTracker = (client) => [
    validateTokenAndPermissions(client, 'commander'),
    async (req, res) => {
        try {
            const { member } = req.tokenData;
            const commanderChar = await charManager.getChars(member.id);
            const commanderName = commanderChar?.main?.character_name || member.user.tag;
            const commanderDiscordId = member.id; // Pass the Discord ID to the frontend

            const io = req.app.get('io');
            if (io) {
                await syncLogiStatus(io);
            }

            const pilots = await trainingManager.getAllPilots();

            res.render('trainingTracker', {
                token: req.params.token,
                pilots,
                commanderName,
                commanderDiscordId, // Pass ID to EJS template
                permissions: {
                    canEdit: roleManager.hasPermission(member, ['line_commander', 'admin']),
                    canAddResidents: roleManager.hasPermission(member, ['council', 'admin'])
                }
            });
        } catch (error) {
            logger.error('Error preparing training tracker page:', error);
            res.status(500).render('error', { title: 'Server Error', message: 'Could not load training data.' });
        }
    }
];

/**
 * Handles adding a new resident to the tracker.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.addResident = (client) => [
    validateTokenAndPermissions(client, 'council'),
    async (req, res) => {
        const { pilotName, discordId } = req.body;
        const io = req.app.get('io');

        if (!pilotName || !discordId) {
            return res.status(400).json({ success: false, message: 'Pilot name and Discord ID are required.' });
        }

        try {
            const result = await trainingManager.addResident(pilotName, discordId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in addResident controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles updating a pilot's progress for simple fields.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.updateProgress = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { pilotId, field, value } = req.body;
        const io = req.app.get('io');

        if (pilotId === undefined || field === undefined || value === undefined) {
            return res.status(400).json({ success: false, message: 'Missing pilotId, field, or value.' });
        }

        try {
            const result = await trainingManager.updatePilotProgress(pilotId, field, value);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in updateProgress controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles adding a comment to a pilot's record.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.addComment = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { token } = req.params;
        const tokenData = client.activeTrainingTokens?.get(token);

        if (!tokenData || Date.now() > tokenData.expires) {
            if (tokenData) client.activeTrainingTokens.delete(token);
            return res.status(403).json({ success: false, message: 'This form session has expired. Please try again. Your changes were not saved.' });
        }

        const { pilotId, comment } = req.body;
        const io = req.app.get('io');

        if (!pilotId || !comment) {
            return res.status(400).json({ success: false, message: 'Missing pilot ID or comment.' });
        }

        try {
            const discordId = req.tokenData.user.id;
            const commanderChar = await charManager.getChars(discordId);
            const commanderName = commanderChar?.main?.character_name || req.tokenData.user.tag;

            const result = await trainingManager.addComment(pilotId, comment, commanderName, discordId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in addComment controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles fetching all pilot data as JSON for real-time updates.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.getPilotsData = (client) => [
    validateTokenAndPermissions(client),
    async (req, res) => {
        try {
            const pilots = await trainingManager.getAllPilots();
            res.json({ success: true, pilots });
        } catch (error) {
            logger.error('Error fetching pilot data for API:', error);
            res.status(500).json({ success: false, message: 'Could not load training data.' });
        }
    }
];

/**
 * Handles adding a signoff with a comment.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.addSignoff = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { pilotId, field, comment } = req.body;
        const io = req.app.get('io');

        if (!pilotId || !field) {
            return res.status(400).json({ success: false, message: 'Missing pilot ID or sign-off field.' });
        }

        try {
            const discordId = req.tokenData.user.id;
            const commanderChar = await charManager.getChars(discordId);
            const commanderName = commanderChar?.main?.character_name || req.tokenData.user.tag;

            const result = await trainingManager.addSignoff(pilotId, field, commanderName, comment, discordId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in addSignoff controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles removing a signoff.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.removeSignoff = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { pilotId, field } = req.body;
        const io = req.app.get('io');

        if (!pilotId || !field) {
            return res.status(400).json({ success: false, message: 'Missing pilot ID or sign-off field.' });
        }

        try {
            const discordId = req.tokenData.user.id;

            const result = await trainingManager.removeSignoff(pilotId, field, discordId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in removeSignoff controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];
