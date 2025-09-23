const express = require('express');
const router = express.Router();
const embedController = require('../controllers/embedController');

/**
 * Factory function to create the embed creator router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the editor page
    router.get('/embed/:token', embedController.showCreator(client));

    // Route to handle the form submission
    router.post('/embed/:token', embedController.handleCreatorSubmission(client));

    return router;
};
