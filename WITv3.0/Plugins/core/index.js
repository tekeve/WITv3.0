// --- plugins/core-functionality/index.js ---
// This plugin loads all your legacy commands, events, and starts the web server.
// This is a temporary step. The goal is to move all this logic
// into smaller, dedicated plugins over time.

const fs = require('fs');
const path = require('path');

/**
 * Initializes the core-functionality plugin.
 * @param {object} services - Core services injected from app.js
 */
function initialize(services) {
    const { client, logger } = services;

    logger.info('Initializing Core Functionality Plugin...');

    // --- EVENT HANDLER ---
    // This code is moved from original app.js
    logger.info('Loading core events...');
    const eventsPath = path.join(__dirname, '../../events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            // ** CRITICAL CHANGE **
            // We now pass the entire 'services' object to the event, not just 'client'
            client.once(event.name, (...args) => event.execute(...args, services));
        } else {
            // ** CRITICAL CHANGE **
            // We now pass the entire 'services' object to the event, not just 'client'
            client.on(event.name, (...args) => event.execute(...args, services));
        }
    }
    logger.info('Core events loaded.');

    // --- 2. MIGRATE COMMAND HANDLER ---
    // This code is moved from your original app.js
    // ...
    logger.info('Loading core commands...');
    // NOTE: fs operations still use relative paths.
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
            } else {
                logger.warn(`Command file at ${filePath} is missing "data" or "execute" property.`);
            }
        }
    }
    logger.info('Core commands loaded.');


    // --- 3. MIGRATE WEB SERVER START ---
    // This code is moved from your original app.js
    logger.info('Starting web server via core plugin...');
    // Use the module-alias for the web server
    const startServer = require('@web/server');

    // ** CRITICAL CHANGE **
    // We now pass the entire 'services' object to the server.
    // You will need to refactor web/server.js to accept this.
    startServer(services);
    logger.info('Web server started by core-functionality plugin.');
}

module.exports = {
    initialize
};

