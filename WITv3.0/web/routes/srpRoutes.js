const express = require('express');
const router = express.Router();
const srpController = require('@webControllers/srpController');

/**
 * Factory function to create the SRP router.
 * @param {Client} client The Discord client instance.
 * @param {Map<string, any>} activeSrpTokens The map of active SRP tokens.
 * @returns The configured Express router.
 */
module.exports = (client, activeSrpTokens) => {
    // Route to display the form
    router.get('/srp/:token', srpController.showSrpForm(activeSrpTokens));

    // Route to handle the form submission
    router.post('/srp/:token', srpController.handleSrpSubmission(client, activeSrpTokens));

    return router;
};