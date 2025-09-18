const express = require('express');
const router = express.Router();
const githubController = require('@webControllers/githubController');

/**
 * Factory function to create the GitHub webhook router.
 * @param {Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to handle incoming webhook payloads from GitHub
    router.post('/github-webhook', githubController.handleWebhook(client));

    return router;
};
