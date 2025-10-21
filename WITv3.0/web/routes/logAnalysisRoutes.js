const express = require('express');
const router = express.Router();
const logAnalysisController = require('@webControllers/logAnalysisController');

/**
 * Factory function to create the Combat Log Analysis router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the form
    router.get('/loganalysis', logAnalysisController.showLogAnalysisForm(client));

    // API route to handle log processing and analysis
    router.post('/loganalysis/process', logAnalysisController.handleLogSubmission(client));

    return router;
};
