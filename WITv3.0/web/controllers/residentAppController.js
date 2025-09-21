const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Renders the Resident Application form if the token is valid.
 * @param {Map<string, any>} activeResidentAppTokens - The map storing valid tokens.
 * @returns An async function to handle the GET request.
 */
exports.showResidentAppForm = (activeResidentAppTokens) => async (req, res) => {
    const { token } = req.params;

    if (!activeResidentAppTokens.has(token)) {
        logger.warn(`Invalid or expired resident app token used: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This application form link is no longer valid. Please generate a new one using the /residentapp command in Discord.',
        });
    }

    res.render('residentAppForm', { token });
};

/**
 * Handles the submission of the Resident Application form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {Map<string, any>} activeResidentAppTokens - The map storing valid tokens.
 * @returns An async function to handle the POST request.
 */
exports.handleResidentAppSubmission = (client, activeResidentAppTokens) => async (req, res) => {
    const { token } = req.params;
    const appData = activeResidentAppTokens.get(token);

    // --- FIX START ---
    // Add a check to ensure the token is valid before proceeding.
    // This prevents a crash if the form is submitted after the token expires.
    if (!appData) {
        logger.warn(`Attempted submission with invalid or expired resident app token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This application form link has expired and cannot be submitted. Please generate a new one.',
        });
    }
    // --- FIX END ---

    // Invalidate the token immediately to prevent double submissions
    activeResidentAppTokens.delete(token);

    try {
        const { interaction, user } = appData;
        const formData = req.body;

        client.emit('residentAppSubmission', {
            interaction,
            user,
            formData
        });

        res.render('success', {
            title: 'Application Submitted!',
            message: 'Your application has been received and will be processed shortly. You can now close this window.',
        });

    } catch (error) {
        logger.error('Error processing resident application submission:', error);
        res.status(500).render('error', {
            title: 'Submission Failed',
            message: 'An internal error occurred while processing your application. Please try again later.',
        });
    }
};
