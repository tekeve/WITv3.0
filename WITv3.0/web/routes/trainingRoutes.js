const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

/**
 * Factory function to create the Commander Training router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the tracker page (matches GET /training/:token)
    router.get('/:token', trainingController.showTracker(client));

    // API routes are now relative to /training (e.g., /training/api/update/:token)
    router.post('/api/add-resident/:token', trainingController.addResident(client));
    router.post('/api/update/:token', trainingController.updateProgress(client));
    router.post('/api/add-comment/:token', trainingController.addComment(client));
    router.get('/api/pilots/:token', trainingController.getPilotsData(client));
    router.post('/api/add-signoff/:token', trainingController.addSignoff(client));
    router.post('/api/remove-signoff/:token', trainingController.removeSignoff(client));

    return router;
};
