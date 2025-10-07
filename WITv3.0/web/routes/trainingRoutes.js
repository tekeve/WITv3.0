const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

/**
 * Factory function to create the Commander Training router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the tracker
    router.get('/training/:token', trainingController.showTracker(client));

    // API routes for interaction
    router.post('/training/add-resident/:token', trainingController.addResident(client));
    router.post('/training/update/:token', trainingController.updateProgress(client));
    router.post('/training/add-comment/:token', trainingController.addComment(client));

    return router;
};
