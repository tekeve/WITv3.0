const express = require('express');
const router = express.Router();
const authController = require('@webControllers/authController'); // Path is relative to this file

/**
 * Factory function to create the authentication router.
 * @param {Client} client The Discord client instance, needed for the controller.
 * @returns The configured Express router.
 */
module.exports = (client) => {
    // Define the GET route for /callback and link it to the controller function
    router.get('/callback', authController.handleCallback(client));

    // You can add more auth-related routes here in the future
    // e.g., router.get('/logout', ...);

    return router;
};