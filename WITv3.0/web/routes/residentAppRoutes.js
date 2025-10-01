const express = require('express');
const router = express.Router();
const residentAppController = require('../controllers/residentAppController');

/**
 * Factory function to create the Resident Application router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Specific routes must be defined BEFORE generic routes with parameters.
    // This ensures that a request to '/residentapp/validate-char' is not captured by '/residentapp/:token'.
    router.post('/residentapp/validate-char', residentAppController.validateCharacter());

    // Routes for displaying and handling the main form submission.
    router.get('/residentapp/:token', residentAppController.showForm(client));
    router.post('/residentapp/:token', residentAppController.handleSubmission(client));

    return router;
};