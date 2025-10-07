const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');

/**
 * Factory function to create the Quiz router.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the main quiz page (selection or specific quiz)
    router.get('/quiz/:token', quizController.showQuizForm(client));

    // API route to get data for a specific quiz
    router.get('/quiz/api/data/:token/:quizId', quizController.getQuizData(client));

    // API route to handle the submission of a quiz
    router.post('/quiz/api/submit/:token/:quizId', quizController.handleQuizSubmission(client));

    return router;
};
