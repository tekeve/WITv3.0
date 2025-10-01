const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');
const db = require('@helpers/database');

/**
 * Renders the Resident Application form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the GET request.
 */
exports.showForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeResidentAppTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This application form link is invalid or has expired.' });
    }

    const { user } = tokenData;

    let mainChar = null;
    let alts = [];
    let forumIdentity = '';

    try {
        // Fetch existing character data
        const charData = await charManager.getChars(user.id);
        if (charData && charData.main) {
            mainChar = charData.main;
            alts = charData.alts;
        }

        // Fetch the last used forum identity from previous applications
        const forumIdQuery = 'SELECT forum_identity FROM resident_applications WHERE discord_id = ? ORDER BY id DESC LIMIT 1';
        const forumIdResult = await db.query(forumIdQuery, [user.id]);
        if (forumIdResult.length > 0) {
            forumIdentity = forumIdResult[0].forum_identity;
        }

    } catch (error) {
        logger.error(`Failed to pre-fetch character data for ${user.tag}:`, error);
        // If there's an error, we'll just render the form without pre-filled data.
    }

    res.render('residentAppForm', {
        token,
        discordTag: user.tag,
        mainChar: mainChar,
        alts: alts,
        forumIdentity: forumIdentity
    });
};

/**
 * Handles the submission of the Resident Application form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the POST request.
 */
exports.handleSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeResidentAppTokens?.get(token);

    if (!tokenData) {
        logger.warn(`Attempted submission with invalid or expired resident app token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This application form link has expired and cannot be submitted. Please generate a new one.',
        });
    }

    client.activeResidentAppTokens.delete(token);

    const { user, guildId } = tokenData;

    client.emit('residentAppSubmission', {
        user,
        guildId,
        formData: req.body
    });

    res.render('success', {
        title: 'Application Submitted!',
        message: 'Your application has been received and will be processed shortly. You can now close this window.',
    });
};


/**
 * Handles real-time validation of a character name against the ESI.
 * @returns An async function to handle the POST request.
 */
exports.validateCharacter = () => async (req, res) => {
    // The web form will send a JSON body, so we need express.json() middleware in server.js
    const { characterName } = req.body;

    if (!characterName || characterName.trim().length < 3) {
        return res.json({ success: false, message: 'Name is too short.' });
    }

    try {
        const charDetails = await charManager.getCharacterDetails(characterName);

        if (charDetails) {
            // Character found, return success and the correctly capitalized name
            res.json({ success: true, characterName: charDetails.character_name });
        } else {
            // Character not found by ESI
            res.json({ success: false, message: 'Character not found in EVE Online.' });
        }
    } catch (error) {
        // Handle potential ESI errors (e.g., 503, timeout)
        logger.error(`ESI validation error for character "${characterName}":`, error.message);
        res.status(500).json({ success: false, message: 'Could not contact ESI. Please try again.' });
    }
};

