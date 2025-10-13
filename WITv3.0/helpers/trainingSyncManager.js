const db = require('@helpers/database');
const logger = require('@helpers/logger');
const trainingManager = require('@helpers/trainingManager');

/**
 * Checks the trusted pilots list and updates the commander training tracker accordingly.
 * @param {import('socket.io').Server} [io] - Optional Socket.IO server instance to emit updates.
 */
async function syncLogiStatus(io) {
    logger.info('[TrainingSync] Starting trusted logi status sync...');
    try {
        // Get all pilots currently in the training program
        const pilotsInTraining = await db.query('SELECT pilot_id, pilot_name, signoff_trusted_logi FROM commander_training');
        if (pilotsInTraining.length === 0) {
            logger.info('[TrainingSync] No pilots in training to sync.');
            return;
        }

        // Get all pilots who are currently trusted for logistics
        const trustedPilotsResult = await db.query('SELECT pilot_name FROM trusted_pilots');
        const trustedPilots = new Set(trustedPilotsResult.map(p => p.pilot_name));

        let updates = 0;
        const promises = [];

        for (const pilot of pilotsInTraining) {
            const isTrustedInLogi = trustedPilots.has(pilot.pilot_name);
            const isTrustedInTraining = !!pilot.signoff_trusted_logi; // Convert 1/0 to true/false

            // If the status in the training tracker doesn't match the actual logi status, update it
            if (isTrustedInLogi !== isTrustedInTraining) {
                promises.push(trainingManager.updateTrustedLogiStatus(pilot.pilot_name, isTrustedInLogi));
                updates++;
            }
        }

        await Promise.all(promises);

        if (updates > 0) {
            logger.success(`[TrainingSync] Synced trusted logi status for ${updates} pilot(s).`);
            // If an io instance is provided, notify connected clients that data has changed
            if (io) {
                io.emit('training-update');
            }
        } else {
            logger.info('[TrainingSync] All trusted logi statuses are already in sync.');
        }

    } catch (error) {
        logger.error('[TrainingSync] Error during trusted logi sync:', error);
    }
}

/**
 * Initializes the sync manager, running a sync on startup and scheduling it to run periodically.
 * @param {import('discord.js').Client} client - The Discord client.
 */
function initialize(client) {
    // Run once on startup after a short delay to ensure everything is ready
    setTimeout(() => syncLogiStatus(client.io), 15000); // 15s delay

    // Then, set it to run every 5 minutes
    setInterval(() => syncLogiStatus(client.io), 5 * 60 * 1000);
    logger.info('[TrainingSync] Scheduled trusted logi sync to run every 5 minutes.');
}

module.exports = { initialize, syncLogiStatus };

