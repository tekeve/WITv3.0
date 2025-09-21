const express = require('express');
const path = require('path');
const logger = require('@helpers/logger');
require('dotenv').config();

// Import routers
const authRoutes = require('./routes/authRoutes');
const srpRoutes = require('./routes/srpRoutes');
const setupRoutes = require('./routes/setupRoutes');
const webeditRoutes = require('./routes/webeditRoutes');
const actionlogRoutes = require('./routes/actionlogRoutes');
const residentAppRoutes = require('./routes/residentAppRoutes');

/**
 * Initializes and starts the Express web server.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function startServer(client) {
    const app = express();
    const host = process.env.HOST_NAME;


    app.use(express.urlencoded({ extended: true }));

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Load and use all the routers
    app.use('/', authRoutes(client));
    app.use('/', srpRoutes(client, client.activeSrpTokens));
    app.use('/', setupRoutes(client, client.activeSetupTokens));
    app.use('/', webeditRoutes(client, client.activeWebEditTokens));
    app.use('/', actionlogRoutes(client));
    app.use('/', residentAppRoutes(client, client.activeResidentAppTokens));

    app.get('/', (req, res) => {
        res.send('Web server is running.');
    });

    app.listen(3000,  () => {
        logger.success(`✅ Server is running and listening on http://${host}`);
    });
}

module.exports = { startServer };

