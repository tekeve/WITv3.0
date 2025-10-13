const express = require('express');
const router = express.Router();
const quizManagerController = require('../controllers/quizManagerController');

/**
 * Factory function to create the Quiz Manager router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the main dashboard
    router.get('/quizmanager/:token', quizManagerController.showDashboard(client));

    // Route to show the editor for a new quiz
    router.get('/quizmanager/:token/create', quizManagerController.showEditor(client));

    // Route to show the editor for an existing quiz
    router.get('/quizmanager/:token/edit/:quizId', quizManagerController.showEditor(client));

    // Route to handle the form submission for both create and edit
    router.post('/quizmanager/:token/save', quizManagerController.handleManagerSubmission(client));

    // Route to handle deleting a quiz
    router.post('/quizmanager/:token/delete/:quizId', quizManagerController.handleDelete(client));

    return router;
};

