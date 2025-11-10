// --- services/index.js ---
// This file imports all helper modules and exports them as a single 'services' object.
// It also provides an initialization function for services that need async setup.

const logger = require('@services/logger');
const db = require('@services/database');
const configManager = require('@helpers/configManager');
const srpManager = require('@helpers/srpManager');
const logiManager = require('@helpers/logiManager');
const reactionRoleManager = require('@helpers/reactionRoleManager');
const scheduler = require('@helpers/scheduler');
const reminderManager = require('@helpers/reminderManager');
const incursionManager = require('@helpers/incursionManager');
const walletMonitor = require('@helpers/walletMonitor');
const trainingManager = require('@helpers/trainingManager');
const trainingSyncManager = require('@helpers/trainingSyncManager');
const authManager = require('@helpers/authManager');
const characterManager = require('@helpers/characterManager');
const esiService = require('@helpers/esiService');
const googleAuth = require('@helpers/googleAuth');
const mailManager = require('@helpers/mailManager');
const moderationManager = require('@helpers/moderationManager');
const roleManager = require('@helpers/roleManager');
const statusManager = require('@helpers/statusManager');


const services = {
    logger,
    db,
    configManager,
    srpManager,
    logiManager,
    reactionRoleManager,
    scheduler,
    reminderManager,
    incursionManager,
    walletMonitor,
    trainingManager,
    trainingSyncManager,
    authManager,
    characterManager,
    esiService,
    googleAuth,
    mailManager,
    moderationManager,
    roleManager,
    statusManager
};

/**
 * Initializes asynchronous services like the database and config.
 * This must be called before the client logs in.
 */
async function initializeServices() {
    try {
        await configManager.loadConfig();
        logger.info('Configuration loaded.');

        await db.promise().query('SELECT 1');
        logger.info('Database connected.');

        // Initialize any other services that need it
        // e.g., await googleAuth.initialize();

    } catch (error) {
        logger.error(`Fatal error during service initialization: ${error.message}`);
        console.error(error);
        process.exit(1); // Exit if critical services fail
    }
}

module.exports = {
    services,
    initializeServices
};
