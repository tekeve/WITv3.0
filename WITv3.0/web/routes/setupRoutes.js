const express = require('express');
const router = express.Router();
const setupController = require('@webControllers/setupController');

/**
 * Factory function to create the Setup router.
 * @param {Client} client The Discord client instance.
 * @param {Map<string, any>} activeSetupTokens The map of active SRP tokens.
 * @returns The configured Express router.
 */
module.exports = (client, activeSetupTokens) => {
    // Route to display the form
    router.get('/setup/:token', setupController.showSetupForm(activeSetupTokens));

    // Route to handle the form submission
    router.post('/setup/:token', setupController.handleSetupSubmission(client, activeSetupTokens));

    return router;
};
