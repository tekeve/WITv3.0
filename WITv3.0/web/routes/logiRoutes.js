const express = require('express');
const router = express.Router();
const logiController = require('../controllers/logiController');

/**
 * Factory function to create the Logi Sign-off router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // These specific API routes MUST be defined before the generic /:token route
    router.post('/logi/validate-char', logiController.validateCharacter());
    router.post('/logi/data/:token', logiController.getPaginatedData(client));
    router.post('/logi/demerit/:token', logiController.handleDemerit(client));
    router.post('/logi/comment/:token', logiController.handleTrustedComment(client));

    // Routes for displaying and handling the main form submission for in-progress pilots
    router.get('/logi/:token', logiController.showForm(client));
    router.post('/logi/:token', logiController.handleSignoff(client));

    return router;
};

