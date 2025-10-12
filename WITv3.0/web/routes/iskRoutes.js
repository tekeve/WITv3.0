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

    return router;
};
