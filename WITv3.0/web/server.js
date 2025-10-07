const express = require('express');
const path = require('path');
const logger = require('@helpers/logger');
require('dotenv').config();
const http = require('http');
const { Server } = require("socket.io");

// Import routers
const authRoutes = require('./routes/authRoutes');
const srpRoutes = require('./routes/srpRoutes');
const setupRoutes = require('./routes/setupRoutes');
const webeditRoutes = require('./routes/webeditRoutes');
const actionlogRoutes = require('./routes/actionlogRoutes');
const residentAppRoutes = require('./routes/residentAppRoutes');
const embedRoutes = require('./routes/embedRoutes');
const logiRoutes = require('./routes/logiRoutes');
const reactionRoleRoutes = require('./routes/reactionRoleRoutes');
const trainingRoutes = require('./routes/trainingRoutes'); // Import the new training routes

/**
 * Initializes and starts the Express web server.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function startServer(client) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);
    const host = process.env.HOST_NAME;

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // WebSocket connection handler
    io.on('connection', (socket) => {
        logger.info('A user connected to the web interface via WebSocket.');
        socket.on('disconnect', () => {
            logger.info('A user disconnected from the web interface.');
        });
    });

    // Load and use all the routers
    app.use('/', authRoutes(client));
    app.use('/', srpRoutes(client, client.activeSrpTokens));
    app.use('/', setupRoutes(client, client.activeSetupTokens));
    app.use('/', webeditRoutes(client, client.activeWebEditTokens));
    app.use('/', actionlogRoutes(client));
    app.use('/', residentAppRoutes(client, client.activeResidentAppTokens));
    app.use('/', embedRoutes(client));
    app.use('/', logiRoutes(client, io));
    app.use('/', reactionRoleRoutes(client));
    app.use('/', trainingRoutes(client)); // Use the new training routes

    app.get('/', (req, res) => {
        res.send('Web server is running.');
    });

    server.listen(3000, () => {
        logger.success(`✅ Server is running and listening on http://${host}`);
    });
}

module.exports = { startServer };
