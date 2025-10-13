const logger = require('@helpers/logger');
const logiManager = require('@helpers/logiManager');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

/**
 * Renders the Logi Sign-off form page.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) { // If token exists but is expired, delete it.
            client.activeLogiTokens.delete(token);
        }
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This sign-off form link is invalid or has expired.' });
    }

    try {
        const commanderChar = await charManager.getChars(tokenData.user.id);
        const commanderName = commanderChar?.main?.character_name || tokenData.user.tag;
        const isLeadership = roleManager.isLeadership(tokenData.member) || roleManager.isAdmin(tokenData.member);

        // Fetch initial data for both lists
        const initialData = await logiManager.getSignoffData();

        // Ensure the data passed to the template is always a valid object with proper structure
        const inProgressData = {
            pilots: initialData.inProgress?.pilots || [],
            total: initialData.inProgress?.total || 0,
            page: initialData.inProgress?.page || 1,
            limit: initialData.inProgress?.limit || 10,
            search: ''
        };

        const trustedData = {
            pilots: initialData.trusted?.pilots || [],
            total: initialData.trusted?.total || 0,
            page: initialData.trusted?.page || 1,
            limit: initialData.trusted?.limit || 10,
            search: ''
        };

        res.render('logiForm', {
            token,
            commanderName,
            inProgressData,
            trustedData,
            isLeadership,
        });
    } catch (error) {
        logger.error('Error preparing logi sign-off page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load pilot data.' });
    }
};

/**
 * Handles submission for a new signoff (in-progress pilots).
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
exports.handleSignoff = (client, io) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogiTokens.delete(token);
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }

    const { pilotName, commanderName, comment, adminOverride } = req.body;
    const isLeadership = roleManager.isLeadership(tokenData.member) || roleManager.isAdmin(tokenData.member);

    try {
        let result;
        if (adminOverride && isLeadership) {
            // If the override checkbox is checked and the user is an admin, add directly to trusted.
            result = await logiManager.addPilotDirectlyToTrusted(pilotName, commanderName, comment, client);
        } else {
            // Otherwise, follow the normal signoff process.
            result = await logiManager.addSignoff(pilotName, commanderName, comment, client);
        }

        if (result.success) {
            io.emit('logi-update'); // Notify all clients of the change
            if (result.promoted) {
                io.emit('training-update'); // Notify training tracker of the status change
            }
        }
        res.json(result);
    } catch (error) {
        logger.error('Error in handleSignoff:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the signoff.' });
    }
};

/**
 * Handles submission for a new demerit (trusted pilots).
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
exports.handleDemerit = (client, io) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogiTokens.delete(token);
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }

    const { pilotName, commanderName, comment } = req.body;

    try {
        const result = await logiManager.addDemerit(pilotName, commanderName, comment, client);
        if (result.success) {
            io.emit('logi-update'); // Notify all clients
            if (result.demoted) {
                io.emit('training-update'); // Notify training tracker of the status change
            }
        }
        res.json(result);
    } catch (error) {
        logger.error('Error in handleDemerit:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the demerit.' });
    }
};

/**
 * Handles submission for a positive comment for a trusted pilot.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
exports.handleTrustedComment = (client, io) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogiTokens.delete(token);
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }

    const { pilotName, commanderName, comment } = req.body;

    try {
        const result = await logiManager.addTrustedComment(pilotName, commanderName, comment);
        if (result.success) {
            io.emit('logi-update'); // Notify all clients
        }
        res.json(result);
    } catch (error) {
        logger.error('Error in handleTrustedComment:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the comment.' });
    }
};

/**
 * Handles deleting a pilot from a list (admin only).
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
exports.handleDeletePilot = (client, io) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogiTokens.delete(token);
        return res.status(403).json({ success: false, message: 'This form session has expired.' });
    }

    if (!roleManager.isAdmin(tokenData.member)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
    }

    const { pilotName, listType } = req.body;

    try {
        const result = await logiManager.deletePilot(pilotName, listType);
        if (result.success) {
            io.emit('logi-update'); // Notify all clients
            io.emit('training-update'); // Also notify training in case the pilot was removed
        }
        res.json(result);
    } catch (error) {
        logger.error('Error in handleDeletePilot:', error);
        res.status(500).json({ success: false, message: 'An error occurred while deleting the pilot.' });
    }
};

/**
 * Handles real-time validation of a character name against ESI.
 */
exports.validateCharacter = async (req, res) => {
    const { characterName } = req.body;
    if (!characterName || characterName.trim().length < 3) {
        return res.json({ success: false, message: 'Name is too short.' });
    }
    try {
        const charDetails = await logiManager.validateCharacter(characterName);
        if (charDetails) {
            res.json({ success: true, characterName: charDetails.character_name });
        } else {
            res.json({ success: false, message: 'Character not found in EVE Online.' });
        }
    } catch (error) {
        logger.error(`ESI validation error for character "${characterName}":`, error.message);
        res.status(500).json({ success: false, message: 'Could not contact ESI. Please try again.' });
    }
};

/**
 * Handles fetching paginated/searched data for the lists.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.getPaginatedData = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData || Date.now() > tokenData.expires) {
        if (tokenData) client.activeLogiTokens.delete(token);
        return res.status(403).json({ success: false, message: 'This form session has expired. Please refresh the page or generate a new link.' });
    }

    try {
        const data = await logiManager.getSignoffData(req.body);

        const response = {
            success: true,
            data: {
                inProgress: {
                    pilots: data.inProgress?.pilots || [],
                    total: data.inProgress?.total || 0,
                    page: data.inProgress?.page || 1,
                    limit: data.inProgress?.limit || 10
                },
                trusted: {
                    pilots: data.trusted?.pilots || [],
                    total: data.trusted?.total || 0,
                    page: data.trusted?.page || 1,
                    limit: data.trusted?.limit || 10
                }
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Error in getPaginatedData:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch updated data.' });
    }
};

