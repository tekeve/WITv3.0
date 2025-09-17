const express = require('express');
const router = express.Router();
const webEditController = require('../controllers/webEditController');

/**
 * Factory function to create the web editor router.
 * @param {Client} client The Discord client instance.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Route to display the editor page
    router.get('/webedit/:token', webEditController.showEditor(client));

    // Route to handle the form submission and update the database
    router.post('/webedit/:token', webEditController.handleUpdate(client));

    return router;
};
