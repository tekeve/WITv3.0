const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');

/**
 * Factory function to create the Commander Training router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the tracker page
    router.get('/:token', trainingController.showTracker(client));

    // API routes
    router.post('/api/add-resident/:token', trainingController.addResident(client));
    router.post('/api/promote-to-tfc/:token', trainingController.promoteToTfc(client));
    router.post('/api/update-resident/:token', trainingController.updateResidentProgress(client));
    router.post('/api/update-tfc/:token', trainingController.updateTfcProgress(client));
    router.post('/api/add-comment/:token', trainingController.addComment(client));
    router.get('/api/data/:token', trainingController.getTrackerData(client));
    router.post('/api/add-signoff/:token', trainingController.addSignoff(client));
    router.post('/api/remove-signoff/:token', trainingController.removeSignoff(client));
    router.post('/api/search-residents/:token', trainingController.searchForResidents(client));
    router.post('/api/search-tfc-candidates/:token', trainingController.searchForTfcCandidates(client));
    router.post('/api/remove-pilot/:token', trainingController.removePilot(client));

    return router;
};

