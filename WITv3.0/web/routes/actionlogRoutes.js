const express = require('express');
const router = express.Router();
// Corrected path to the controller file
const actionlogController = require('../controllers/actionlogController');

/**
 * Factory function to create the action log settings router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the settings form
    router.get('/actionlog/:token', actionlogController.showSettingsForm(client));

    // Route to handle the form submission
    router.post('/actionlog/:token', actionlogController.handleSettingsSubmission(client));

    return router;
};

