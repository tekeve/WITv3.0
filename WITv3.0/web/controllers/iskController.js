const logger = require('@helpers/logger');

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
        // Render the EJS view, passing necessary data
        res.render('iskForm', {
            token,
            user: tokenData.user,
        });
    } catch (error) {
        logger.error('Error preparing ISK tracker page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load the ISK tracker page.' });
    }
};
