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

    // API routes for interaction (namespaced for clarity)
    router.post('/training/api/add-resident/:token', trainingController.addResident(client));
    router.post('/training/api/update/:token', trainingController.updateProgress(client));
    router.post('/training/api/add-comment/:token', trainingController.addComment(client));
    router.get('/training/api/pilots/:token', trainingController.getPilotsData(client));
    router.post('/training/api/add-signoff/:token', trainingController.addSignoff(client));
    router.post('/training/api/remove-signoff/:token', trainingController.removeSignoff(client));

    return router;
};

