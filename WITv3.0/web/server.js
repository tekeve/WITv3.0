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
const trainingRoutes = require('./routes/trainingRoutes');
const quizRoutes = require('./routes/quizRoutes');
const quizManagerRoutes = require('./routes/quizManagerRoutes');
const iskRoutes = require('./routes/iskRoutes');
const logAnalysisRoutes = require('./routes/logAnalysisRoutes');
const walletRoutes = require('./routes/walletRoutes'); // Import the new wallet routes
const voteRoutes = require('./routes/voteRoutes');

/**
 * Initializes and starts the Express web server.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function startServer(client) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);
    const host = process.env.HOST_NAME || 'localhost:3000'; // Default host if not set

    // Make the io instance available to all routes
    app.set('io', io);
    // Also attach it to the client for background tasks
    client.io = io;

    // Add maps for the new feature tokens
    client.activeWalletTokens = new Map(); // Add map for wallet monitor tokens

    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    app.use(express.json({ limit: '50mb' }));

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // WebSocket connection handler
    io.on('connection', (socket) => {
        logger.info('A user connected to the web interface via WebSocket.');
        socket.on('disconnect', () => {
            logger.info('A user disconnected from the web interface.');
        });
        // Example: Listen for a specific event from the client if needed
        // socket.on('request-update', () => {
        //    logger.info('Client requested data update via WebSocket.');
        //    // Handle update logic, maybe fetch new data and emit back
        // });
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
    app.use('/training', trainingRoutes(client));
    app.use('/', quizRoutes(client));
    app.use('/', quizManagerRoutes(client));
    app.use('/', iskRoutes(client));
    app.use('/', logAnalysisRoutes(client));
    app.use('/', walletRoutes(client)); // Use the new wallet routes
    app.use('/', voteRoutes(client));

    app.get('/', (req, res) => {
        res.send('Web server is running.');
    });

    // Error handling middleware (optional but recommended)
    app.use((err, req, res, next) => {
        logger.error('Unhandled error in Express route:', err);
        res.status(500).render('error', { title: 'Server Error', message: 'An unexpected error occurred.' });
    });


    server.listen(3000, () => {
        logger.success(`✅ Server is running and listening on http://${host}`);
    });
}

module.exports = { startServer };
