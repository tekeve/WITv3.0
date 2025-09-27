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

        // Ensure the data passed to the template is always a valid object with proper structure
        const inProgressData = {
            pilots: initialData.inProgress?.pilots || [],
            total: initialData.inProgress?.total || 0,
            page: initialData.inProgress?.page || 1,
            limit: initialData.inProgress?.limit || 10, // Changed from 25 to 10
            search: ''
        };

        const trustedData = {
            pilots: initialData.trusted?.pilots || [],
            total: initialData.trusted?.total || 0,
            page: initialData.trusted?.page || 1,
            limit: initialData.trusted?.limit || 10, // Changed from 25 to 10
            search: ''
        };

        // Debug logging
        console.log('Rendering logi form with data:');
        console.log('In-progress pilots:', inProgressData.pilots.length);
        console.log('Trusted pilots:', trustedData.pilots.length);

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

    try {
        const result = await logiManager.addSignoff(pilotName, commanderName, comment, client);
        res.json(result);
    } catch (error) {
        logger.error('Error in handleSignoff:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the signoff.' });
    }
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

    try {
        const result = await logiManager.addDemerit(pilotName, commanderName, comment, client);
        res.json(result);
    } catch (error) {
        logger.error('Error in handleDemerit:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the demerit.' });
    }
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

    try {
        const result = await logiManager.addTrustedComment(pilotName, commanderName, comment);
        res.json(result);
    } catch (error) {
        logger.error('Error in handleTrustedComment:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing the comment.' });
    }
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

        // Ensure the response has the proper structure
        const response = {
            success: true,
            data: {
                inProgress: {
                    pilots: data.inProgress?.pilots || [],
                    total: data.inProgress?.total || 0,
                    page: data.inProgress?.page || 1,
                    limit: data.inProgress?.limit || 10 // Changed from 25 to 10
                },
                trusted: {
                    pilots: data.trusted?.pilots || [],
                    total: data.trusted?.total || 0,
                    page: data.trusted?.page || 1,
                    limit: data.trusted?.limit || 10 // Changed from 25 to 10
                }
            }
        };

        res.json(response);
    } catch (error) {
        logger.error('Error in getPaginatedData:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch updated data.' });
    }
};