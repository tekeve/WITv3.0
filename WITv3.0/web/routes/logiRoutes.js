const express = require('express');
const router = express.Router();
const logiController = require('../controllers/logiController');

/**
 * Factory function to create the Logi Sign-off router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {import('socket.io').Server} io The Socket.IO server instance.
 * @returns The configured Express router.
 */
module.exports = (client, io) => {
    // These specific API routes MUST be defined before the generic /:token route
    router.post('/logi/validate-char', logiController.validateCharacter);
    router.post('/logi/data/:token', logiController.getPaginatedData(client));
    // Pass the 'io' instance to the controller handlers that modify data
    router.post('/logi/demerit/:token', logiController.handleDemerit(client, io));
    router.post('/logi/comment/:token', logiController.handleTrustedComment(client, io));
    router.post('/logi/delete/:token', logiController.handleDeletePilot(client, io));

    // Routes for displaying and handling the main form submission for in-progress pilots
    router.get('/logi/:token', logiController.showForm(client));
    router.post('/logi/:token', logiController.handleSignoff(client, io));

    return router;
};
