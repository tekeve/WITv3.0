const logger = require('@helpers/logger');
const trainingManager = require('@helpers/trainingManager');
const roleManager = require('@helpers/roleManager');
const charManager = require('@helpers/characterManager');
const { syncLogiStatus } = require('@helpers/trainingSyncManager');
const db = require('@helpers/database');


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

    const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

    if (!roleManager.hasPermission(tokenData.member, requiredPermissions)) {
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
 */
exports.showTracker = (client) => [
    validateTokenAndPermissions(client, ['commander']),
    async (req, res) => {
        try {
            const { member } = req.tokenData;
            const commanderChar = await charManager.getChars(member.id);
            const commanderName = commanderChar?.main?.character_name || member.user.tag;
            const commanderDiscordId = member.id;

            // Fetch all quizzes and categorize them
            const allQuizzes = await db.query('SELECT quiz_id, name, category FROM quizzes');
            const residentQuizzes = allQuizzes.filter(q => q.category === 'resident');
            const tfcQuizzes = allQuizzes.filter(q => q.category === 'training_fc');

            res.render('trainingTracker', {
                token: req.params.token,
                commanderName,
                commanderDiscordId,
                residentQuizzes,
                tfcQuizzes,
                permissions: {
                    canEdit: roleManager.hasPermission(member, ['line_commander', 'admin']),
                    canPromoteToTfc: roleManager.isCouncilOrHigher(member),
                    canAddResidents: roleManager.isCouncilOrHigher(member),
                    canDelete: roleManager.hasPermission(member, ['council', 'admin', 'certified_trainer'])
                }
            });
        } catch (error) {
            logger.error('Error preparing training tracker page:', error);
            res.status(500).render('error', { title: 'Server Error', message: 'Could not load training data.' });
        }
    }
];

/**
 * Handles searching for users who are not yet in the training program.
 */
exports.searchForResidents = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']),
    async (req, res) => {
        const { searchTerm } = req.body;

        if (searchTerm === undefined || searchTerm === null) {
            return res.status(400).json({ success: false, message: 'Search term not provided.' });
        }

        try {
            const users = await trainingManager.searchEligibleResidents(searchTerm);
            res.json({ success: true, users });
        } catch (error) {
            logger.error('Error in searchForResidents controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred during search.' });
        }
    }
];

/**
 * Handles searching for commanders eligible for TFC promotion.
 */
exports.searchForTfcCandidates = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']),
    async (req, res) => {
        const { searchTerm } = req.body;

        if (searchTerm === undefined || searchTerm === null) {
            return res.status(400).json({ success: false, message: 'Search term not provided.' });
        }

        try {
            const users = await trainingManager.searchEligibleTfcCandidates(searchTerm);
            res.json({ success: true, users });
        } catch (error) {
            logger.error('Error in searchForTfcCandidates controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred during search.' });
        }
    }
];


/**
 * Handles adding a new resident to the tracker.
 */
exports.addResident = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']),
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
 * Handles promoting a pilot to Training FC status.
 */
exports.promoteToTfc = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']), // Special permission check is handled in the middleware now
    async (req, res) => {
        const { pilotId } = req.body;
        const io = req.app.get('io');

        if (!pilotId) {
            return res.status(400).json({ success: false, message: 'Pilot ID is required.' });
        }

        try {
            const result = await trainingManager.promoteToTfc(pilotId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in promoteToTfc controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles updating a resident's progress for simple fields.
 */
exports.updateResidentProgress = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { pilotId, field, value } = req.body;
        const io = req.app.get('io');

        if (pilotId === undefined || field === undefined || value === undefined) {
            return res.status(400).json({ success: false, message: 'Missing pilotId, field, or value.' });
        }

        try {
            const result = await trainingManager.updateResidentProgress(pilotId, field, value);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in updateResidentProgress controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];

/**
 * Handles updating a Training FC's progress.
 */
exports.updateTfcProgress = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']), // Requires CT or higher
    async (req, res) => {
        const { pilotId, field, value } = req.body;
        const io = req.app.get('io');

        if (pilotId === undefined || field === undefined || value === undefined) {
            return res.status(400).json({ success: false, message: 'Missing pilotId, field, or value.' });
        }

        try {
            const result = await trainingManager.updateTfcProgress(pilotId, field, value);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in updateTfcProgress controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.' });
        }
    }
];


/**
 * Handles adding a comment to a pilot's record.
 */
exports.addComment = (client) => [
    validateTokenAndPermissions(client, 'line_commander'),
    async (req, res) => {
        const { pilotId, comment, type } = req.body; // type can be 'resident' or 'tfc'
        const io = req.app.get('io');

        if (!pilotId || !comment || !type) {
            return res.status(400).json({ success: false, message: 'Missing required information.' });
        }

        try {
            const discordId = req.tokenData.user.id;
            const commanderChar = await charManager.getChars(discordId);
            const commanderName = commanderChar?.main?.character_name || req.tokenData.user.tag;

            const result = await trainingManager.addComment(pilotId, comment, commanderName, discordId, type);
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
 */
exports.getTrackerData = (client) => [
    validateTokenAndPermissions(client),
    async (req, res) => {
        try {
            // Run logi sync before sending data to ensure it's fresh
            const io = req.app.get('io');
            if (io) {
                await syncLogiStatus(io);
            }
            const data = await trainingManager.getAllTrackerData();
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Error fetching tracker data for API:', error);
            res.status(500).json({ success: false, message: 'Could not load training data.' });
        }
    }
];

/**
 * Handles adding a signoff with a comment.
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

/**
 * Handles removing a pilot from the training program.
 */
exports.removePilot = (client) => [
    validateTokenAndPermissions(client, ['council', 'admin', 'certified_trainer']),
    async (req, res) => {
        const { pilotId } = req.body;
        const io = req.app.get('io');

        if (!pilotId) {
            return res.status(400).json({ success: false, message: 'Pilot ID is required.' });
        }

        try {
            const result = await trainingManager.removePilotFromTraining(pilotId);
            if (result.success && io) {
                io.emit('training-update');
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in removePilot controller:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred while removing the pilot.' });
        }
    }
];


