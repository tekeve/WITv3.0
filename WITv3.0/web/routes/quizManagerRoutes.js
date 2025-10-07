const express = require('express');
const router = express.Router();
const quizManagerController = require('../controllers/quizManagerController');

/**
 * Factory function to create the Quiz Manager router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the manager page
    router.get('/quizmanager/:token', quizManagerController.showManager(client));

    // Route to handle the form submission
    router.post('/quizmanager/:token', quizManagerController.handleManagerSubmission(client));

    return router;
};
