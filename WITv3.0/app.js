require('module-alias/register');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { getLogger, initializeLogger } = require('@services/logger');
initializeLogger();
const { initializeDatabase } = require('@services/database');
const { initializeWebServer } = require('./web/server');
const EsiService = require('@services/esiService');
const WebTokenService = require('@services/webTokenService');
const PluginManager = require('@services/pluginManager');


const logger = getLogger('MainApp');
let dbPool;

// --- Main Application Entry Point ---
async function main() {
    logger.info('Starting WITv3.0...');

    // --- 1. Initialize Discord Client ---
    // Ensure all necessary intents are enabled
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages,
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction,
            Partials.User,
            Partials.GuildMember,
        ],
    });

    // --- 2. Initialize Shared Services ---
    try {
        dbPool = await initializeDatabase();
        logger.info('Database service initialized.');
    } catch (error) {
        logger.error('Failed to initialize database. Exiting.', { error: error.message });
        process.exit(1);
    }

    // Initialize web server (but don't start listening yet)
    const { expressApp, startWebServer } = initializeWebServer();
    logger.info('Web server service initialized.');

    // Create a single object to pass all shared services to plugins
    const sharedServices = {
        db: dbPool,
        webApp: expressApp,
        config: process.env,
        logger: getLogger,
        esiService: new EsiService(dbPool, getLogger, process.env),
    };
    sharedServices.webTokenService = new WebTokenService(sharedServices.db, logger);

    // --- 3. Initialize Plugin Manager ---
    // The PluginManager will now handle loading all commands, events, etc.
    const pluginManager = new PluginManager(client);

    // Pass shared services to all plugins
    pluginManager.loadPlugins(sharedServices);
    logger.info('All plugins loaded.');

    // --- 5. Start Services ---
    // Log in to Discord
    try {
        await client.login(process.env.DISCORD_TOKEN);
        logger.info('Successfully logged in to Discord.');
    } catch (error) {
        logger.error('Failed to log in to Discord. Check your token.', { error: error.message });
        process.exit(1);
    }

    // Now, start the web server *after* plugins have registered routes
    try {
        startWebServer();
        logger.info(`Web server started on port ${process.env.PORT || 3000}`);
    } catch (error) {
        logger.error('Failed to start web server.', { error: error.message });
    }
}

// --- Global Error Handling ---
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason: reason.stack || reason });
});

// Make the uncaughtException handler async so we can use await
process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception. Shutting down...', { error: error.stack || error });

    // Try to gracefully close the database pool before exiting
    if (dbPool) {
        try {
            await dbPool.end();
            logger.info('Database pool closed.');
        } catch (err) {
            logger.error('Error closing database pool during shutdown:', err);
        }
    }
    // No db pool, just exit
    process.exit(1);
});

// Run the application
main().catch(err => {
    // This will catch any error that escapes main()
    logger.error('Fatal error during application startup. Exiting.', { error: err.stack || err });
    process.exit(1);
});