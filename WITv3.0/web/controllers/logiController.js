const logger = require('@helpers/logger');
const logiManager = require('@helpers/logiManager');
const charManager = require('@helpers/characterManager');

/**
 * Renders the Logi Sign-off form page.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeLogiTokens?.get(token);

    if (!tokenData) {
        return res.status(403).render('error', { title: 'Link Invalid', message: 'This sign-off form link is invalid or has expired.' });
    }

    try {
        const commanderChar = await charManager.getChars(tokenData.user.id);
        const commanderName = commanderChar?.main?.character_name || tokenData.user.tag;

        // Fetch initial data for both lists
        const initialData = await logiManager.getSignoffData();

        // Ensure the data passed to the template is always a valid object, even if empty.
        const inProgressData = initialData.inProgress || { pilots: [], total: 0, page: 1, limit: 25 };
        const trustedData = initialData.trusted || { pilots: [], total: 0, page: 1, limit: 25 };

        res.render('logiForm', {
            token,
            commanderName,
            inProgressData,
            trustedData,
        });
    } catch (error) {
        logger.error('Error preparing logi sign-off page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load pilot data.' });
    }
};

/**
 * Handles submission for a new signoff (in-progress pilots).
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleSignoff = (client) => async (req, res) => {
    const { token } = req.params;
    if (!client.activeLogiTokens?.has(token)) {
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }

    const { pilotName, commanderName, comment } = req.body;
    const result = await logiManager.addSignoff(pilotName, commanderName, comment, client);
    res.json(result);
};

/**
 * Handles submission for a new demerit (trusted pilots).
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleDemerit = (client) => async (req, res) => {
    const { token } = req.params;
    if (!client.activeLogiTokens?.has(token)) {
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }
    const { pilotName, commanderName, comment } = req.body;
    const result = await logiManager.addDemerit(pilotName, commanderName, comment, client);
    res.json(result);
};

/**
 * Handles submission for a positive comment for a trusted pilot.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleTrustedComment = (client) => async (req, res) => {
    const { token } = req.params;
    if (!client.activeLogiTokens?.has(token)) {
        return res.status(403).json({ success: false, message: 'This form session has expired. Please generate a new link in Discord.' });
    }
    const { pilotName, commanderName, comment } = req.body;
    const result = await logiManager.addTrustedComment(pilotName, commanderName, comment);
    res.json(result);
};


/**
 * Handles real-time validation of a character name against ESI.
 */
exports.validateCharacter = () => async (req, res) => {
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
    if (!client.activeLogiTokens?.has(token)) {
        return res.status(403).json({ success: false, message: 'This form session has expired. Please refresh the page or generate a new link.' });
    }
    try {
        const data = await logiManager.getSignoffData(req.body);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch updated data.' });
    }
};

