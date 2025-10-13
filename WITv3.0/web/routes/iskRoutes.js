const express = require('express');
const router = express.Router();
const iskController = require('@webControllers/iskController');

/**
 * Factory function to create the ISK Tracker router.
 * This sets up the web endpoint for the form.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the form
    router.get('/isk/:token', iskController.showIskForm(client));

    // Route to display the statistics page
    router.get('/isk/stats/:token', iskController.showIskStats(client));

    // API route to fetch paginated fleet data for the stats page
    router.get('/isk/stats/:token/fleets', iskController.getFleetLogsPage(client));

    // Route to handle log submission
    router.post('/isk/:token/submit', iskController.handleLogSubmission(client));

    // Route to handle log deletion
    router.post('/isk/stats/:token/delete', iskController.handleLogDeletion(client));

    return router;
};

