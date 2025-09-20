const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Renders the resident application form if the token is valid.
 * @param {Map<string, any>} activeResidentAppTokens - The map storing valid tokens.
 * @returns An async function to handle the GET request.
 */
exports.showResidentAppForm = (activeResidentAppTokens) => async (req, res) => {
    const { token } = req.params;

    if (!activeResidentAppTokens.has(token)) {
        logger.warn(`Invalid or expired Resident App token used: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This application form link is no longer valid. Please generate a new one.',
        });
    }
    res.render('residentAppForm', { token });
};

/**
 * Handles the submission of the resident application form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {Map<string, any>} activeResidentAppTokens - The map storing valid tokens.
 * @returns An async function to handle the POST request.
 */
exports.handleResidentAppSubmission = (client, activeResidentAppTokens) => async (req, res) => {
    const { token } = req.params;
    const appData = activeResidentAppTokens.get(token);

    if (!appData) {
        logger.warn(`Attempted submission with invalid or expired Resident App token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This application form link has expired and cannot be submitted. Please generate a new one.',
        });
    }

    activeResidentAppTokens.delete(token);

    try {
        const formData = req.body;
        const { interaction, user } = appData;

        // --- DATABASE INSERTION ---
        const sql = `
            INSERT INTO resident_applications 
            (character_name, alts, forum_identity, discord_identity, wtm_time, logistics_ships, battleship_ships, t2_guns, command_time_estimate, why_commander, why_wtm, discord_id, discord_tag) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            formData.character_name,
            formData.alts,
            formData.forum_identity,
            formData.discord_identity,
            formData.wtm_time,
            formData.logistics_ships,
            formData.battleship_ships,
            formData.t2_guns,
            formData.command_time_estimate,
            formData.why_commander,
            formData.why_wtm,
            user.id,
            user.tag
        ];

        await db.query(sql, values);
        logger.success(`Resident application for ${formData.character_name} has been successfully saved to the database.`);

        // --- EMIT EVENT FOR DISCORD PROCESSING ---
        client.emit('residentAppSubmission', {
            interaction,
            user,
            formData
        });

        res.render('success', {
            title: 'Application Submitted!',
            message: 'Your application has been received. You can now close this window.',
        });

    } catch (error) {
        logger.error('Error processing resident application submission:', error);
        res.status(500).render('error', {
            title: 'Submission Failed',
            message: 'An internal error occurred while processing your application. Please try again later.',
        });
    }
};

