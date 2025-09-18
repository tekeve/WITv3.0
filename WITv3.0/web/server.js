const express = require('express');
const path = require('path'); // Use the 'path' module for robust file paths
const logger = require('@helpers/logger'); // Path updated
require('dotenv').config();

// Import the router factory function from its new location
const authRoutes = require('./routes/authRoutes');
const srpRoutes = require('./routes/srpRoutes');
const setupRoutes = require('./routes/setupRoutes');
const webeditRoutes = require('./routes/webeditRoutes');
const githubRoutes = require('./routes/githubRoutes');

/**
 * Initializes and starts the Express web server.
 * @param {Client} client The Discord client instance.
 */
function startServer(client) {
    const app = express();
    const port = process.env.PORT || 3000;

    // Middleware to parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));
    // Middleware to parse JSON bodies (for webhooks)
    app.use(express.json());

    // Set the view engine to EJS and tell Express where to find the templates
    // Using path.join makes this path absolute and less prone to errors
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // In-memory storage for active SRP tokens. For production, use a database or Redis.
    //const activeSrpTokens = new Map();
    //client.activeSrpTokens = activeSrpTokens; // Attach to client for access in commands

    // Load and use the router, passing the client object
    app.use('/', authRoutes(client));
    app.use('/', srpRoutes(client, client.activeSrpTokens));
    app.use('/', setupRoutes(client, client.activeSetupTokens));
    app.use('/', webeditRoutes(client, client.activeWebEditTokens));
    app.use('/', githubRoutes(client));

    // Optional: Add a simple root route for health checks
    app.get('/', (req, res) => {
        res.send('ESI Callback Server is running.');
    });

    app.listen(port, () => {
        logger.info(`ESI auth callback server listening on port ${port}`);
    });
}

module.exports = { startServer };
