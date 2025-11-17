const express = require('express');
const path = require('path');
const { getLogger } = require('@services/logger');

const logger = getLogger('WebServer');

/**
 * Initializes the Express web server.
 * Creates the app instance but does not start listening.
 * @returns {object} { expressApp, startWebServer }
 */
function initializeWebServer() {
    const app = express();
    const port = process.env.PORT || 3000;

    // View engine setup
    const globalViewsPath = path.join(__dirname, 'views');
    app.set('views', globalViewsPath);
    app.set('view engine', 'ejs');

    // Make global views available to all templates
    app.locals.globalViewsPath = globalViewsPath;

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // --- CORE ROUTES ---
    // Example: A simple health check route
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // NOTE: All application-specific routes (like /auth, /srp, etc.)
    // should be moved into plugins.
    // The old monolithic route loading logic is removed from here.
    // Plugins will register their routes directly on the `app` object.

    // --- Error Handling Middleware ---
    // 404 Handler
    app.use((req, res, next) => {
        res.status(404).render('error', { message: 'Not Found', error: { status: 404 } });
    });

    // General error handler
    app.use((err, req, res, next) => {
        logger.error('Web server error:', { message: err.message, stack: err.stack, path: req.path });
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            // Only show stack trace in development
            error: process.env.NODE_ENV === 'development' || 'dev' ? err : {}
        });
    });

    /**
     * Starts the web server.
     */
    function startWebServer() {
        app.listen(port, () => {
            // Logger is available via closure
            logger.info(`Web server listening on http://${process.env.HOST_NAME}`);
        });
    }

    // Return the app instance for plugins to use, and the start function
    return { expressApp: app, startWebServer };
}

module.exports = { initializeWebServer };