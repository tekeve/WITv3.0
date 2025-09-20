const express = require('express');
const router = express.Router();
const residentAppController = require('../controllers/residentAppController');

/**
 * Factory function to create the Resident Application router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {Map<string, any>} activeResidentAppTokens The map of active tokens.
 * @returns The configured Express router.
 */
module.exports = (client, activeResidentAppTokens) => {
    // Route to display the form
    router.get('/residentapp/:token', residentAppController.showResidentAppForm(activeResidentAppTokens));

    // Route to handle the form submission
    router.post('/residentapp/:token', residentAppController.handleResidentAppSubmission(client, activeResidentAppTokens));

    return router;
};

