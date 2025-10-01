const express = require('express');
const router = express.Router();
const reactionRoleController = require('../controllers/reactionRoleController');

/**
 * Factory function to create the reaction roles router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    router.get('/reactionroles/:token', reactionRoleController.showForm(client));
    router.post('/reactionroles/:token', reactionRoleController.handleSubmission(client));

    return router;
};
