const express = require('express');
const router = express.Router();
const residentAppController = require('../controllers/residentAppController');

/**
 * Factory function to create the Resident Application router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Corrected to use the exported 'showForm' and 'handleSubmission' functions
    router.get('/residentapp/:token', residentAppController.showForm(client));
    router.post('/residentapp/:token', residentAppController.handleSubmission(client));

    return router;
};
