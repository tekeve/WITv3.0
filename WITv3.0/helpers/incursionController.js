const logger = require('@helpers/logger');
const db = require('@helpers/database');
const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const esiService = require('@helpers/esiService');
const { buildActiveIncursionEmbed, buildNoIncursionEmbed, formatDuration } = require('@embeds/incursionEmbed');

// A map to hold the timers for different dynamic ESI calls
const esiTimers = new Map();

/**
 * Calculates the statistics for the last completed incursion based on stored timestamps.
 * @param {object} state - The incursion state object from the database.
 * @returns {object|null} An object with formatted stat strings, or null if stats can't be calculated.
 */
function calculateLastIncursionStats(state) {
    if (!state.spawnTimestamp || !state.endedTimestamp) {
        return null; // Can't calculate without start and end times
    }

    const stats = {};
    const ended = state.endedTimestamp;

    // --- Total Duration ---
    const totalDurSeconds = ended - state.spawnTimestamp;
    const maxTotalDurationSeconds = 8 * 24 * 3600; // 8 days max lifecycle
    const totalDurationPercentage = (totalDurSeconds / maxTotalDurationSeconds) * 100;
    stats.totalDuration = `${formatDuration(totalDurSeconds)} (${parseFloat(totalDurationPercentage.toFixed(2))}% of max)`;

    // --- Established Phase Duration ---
    // This phase occurs if a mobilizing timestamp exists. Its duration is from spawn to mobilizing.
    if (state.mobilizingTimestamp) {
        const establishedDurSeconds = state.mobilizingTimestamp - state.spawnTimestamp;
        const maxEstablishedSeconds = 5 * 24 * 3600; // Max duration is ~5 days
        const percentage = (establishedDurSeconds / maxEstablishedSeconds) * 100;
        stats.establishedPhase = `${formatDuration(establishedDurSeconds)} (${parseFloat(percentage.toFixed(2))}% of max)`;
    }

    // --- Mobilizing Phase Duration ---
    // This phase occurs if a mobilizing timestamp exists. Its duration is from mobilizing to withdrawing (or end).
    if (state.mobilizingTimestamp) {
        const mobilizingEnd = state.withdrawingTimestamp || ended;
        const mobilizingDurSeconds = mobilizingEnd - state.mobilizingTimestamp;
        const maxMobilizingSeconds = 2 * 24 * 3600; // 48 hours
        const percentage = (mobilizingDurSeconds / maxMobilizingSeconds) * 100;
        stats.mobilizingPhase = `${formatDuration(mobilizingDurSeconds)} (${parseFloat(percentage.toFixed(2))}% used)`;
    }

    // --- Withdrawing Period Used ---
    // This phase occurs if a withdrawing timestamp exists.
    if (state.withdrawingTimestamp) {
        const withdrawingDurSeconds = ended - state.withdrawingTimestamp;
        if (withdrawingDurSeconds > 0) {
            const maxWithdrawingSeconds = 24 * 3600; // 24 hours max
            const percentage = (withdrawingDurSeconds / maxWithdrawingSeconds) * 100;
            stats.withdrawingPeriodUsed = `${formatDuration(withdrawingDurSeconds)} (${parseFloat(percentage.toFixed(2))}% used)`;
        }
    }

    return stats;
}


async function readState() {
    try {
        const rows = await db.query('SELECT * FROM incursion_state WHERE id = 1');
        if (rows.length > 0) {
            const state = rows[0];

            // Ensure all timestamps are treated as numbers, handling nulls gracefully.
            state.spawnTimestamp = state.spawnTimestamp ? Number(state.spawnTimestamp) : null;
            state.mobilizingTimestamp = state.mobilizingTimestamp ? Number(state.mobilizingTimestamp) : null;
            state.withdrawingTimestamp = state.withdrawingTimestamp ? Number(state.withdrawingTimestamp) : null;
            state.endedTimestamp = state.endedTimestamp ? Number(state.endedTimestamp) : null;
            state.lastHqSystemId = state.lastHqSystemId ? Number(state.lastHqSystemId) : null;

            if (state.lastIncursionStats && typeof state.lastIncursionStats === 'string') {
                try {
                    state.lastIncursionStats = JSON.parse(state.lastIncursionStats);
                } catch (e) {
                    logger.error('Could not parse lastIncursionStats from database.', e);
                    state.lastIncursionStats = null;
                }
            }
            return state;
        }
        return {};
    } catch (error) {
        logger.error('Failed to read incursion state from database:', error);
        return {};
    }
}

async function writeState(state) {
    try {
        const statsToStore = state.lastIncursionStats ? JSON.stringify(state.lastIncursionStats) : null;
        const sql = `
            INSERT INTO incursion_state (id, lastIncursionState, incursionMessageId, lastHqSystemId, 
                spawnTimestamp, mobilizingTimestamp, withdrawingTimestamp, endedTimestamp, lastIncursionStats) 
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                lastIncursionState = VALUES(lastIncursionState), incursionMessageId = VALUES(incursionMessageId), 
                lastHqSystemId = VALUES(lastHqSystemId), spawnTimestamp = VALUES(spawnTimestamp), 
                mobilizingTimestamp = VALUES(mobilizingTimestamp), withdrawingTimestamp = VALUES(withdrawingTimestamp), 
                endedTimestamp = VALUES(endedTimestamp), lastIncursionStats = VALUES(lastIncursionStats)`;
        await db.query(sql, [
            state.lastIncursionState || null, state.incursionMessageId || null, state.lastHqSystemId || null,
            state.spawnTimestamp || null, state.mobilizingTimestamp || null, state.withdrawingTimestamp || null,
            state.endedTimestamp || null, statsToStore
        ]);
    } catch (error) {
        logger.error('Failed to save incursion state to database:', error);
    }
}

let isUpdating = false;

async function updateIncursions(client, options = {}) {
    if (isUpdating) {
        logger.info('Update already in progress, skipping this cycle.');
        return;
    }
    isUpdating = true;
    logger.info('Checking for incursion updates...');

    // Clear any existing timer before starting a new check
    if (esiTimers.has('incursions')) {
        clearTimeout(esiTimers.get('incursions'));
        esiTimers.delete('incursions');
    }

    const state = await readState();
    const config = configManager.get();
    const incursionSystems = incursionManager.get();
    const { isManualRefresh = false } = options;

    if (!config.incursionChannelId) {
        logger.warn('incursionChannelId is not configured. Skipping update.');
        isUpdating = false;
        return;
    }

    try {
        let highSecIncursion;
        let nextCheckDelay = 60 * 1000; // Default to 60 seconds
        const mockOverride = client.mockOverride;
        const isUsingMock = mockOverride && mockOverride.expires > Date.now();

        if (isUsingMock) {
            logger.info(`Using mock state override: ${JSON.stringify(mockOverride)}`);
            if (mockOverride.state === 'none') {
                highSecIncursion = null;
            } else {
                const spawnData = incursionSystems.find(c => c.Constellation.toLowerCase() === mockOverride.constellationName.toLowerCase());
                if (spawnData) {
                    highSecIncursion = {
                        constellation_id: spawnData.Constellation_id,
                        state: mockOverride.state,
                        staging_solar_system_id: spawnData.dock_up_system_id,
                        faction_id: spawnData.region_faction,
                        systemData: { security_status: 0.8 }
                    };
                } else {
                    highSecIncursion = null;
                }
            }
        } else {
            if (mockOverride) {
                logger.info('Mock override has expired. Resuming ESI updates.');
                client.mockOverride = null;
            }
            const { data: allIncursions, expires: incursionsExpiry } = await esiService.get({ endpoint: '/incursions/', caller: __filename });

            if (incursionsExpiry) {
                const buffer = 5000; // 5 second buffer
                nextCheckDelay = (incursionsExpiry - Date.now()) + buffer;
                if (nextCheckDelay < 10000) { // Ensure at least 10 seconds delay
                    nextCheckDelay = 10000;
                }
            }

            if (!Array.isArray(allIncursions)) {
                logger.error(`ESI /incursions/ endpoint did not return an array. Response:`, allIncursions);
                isUpdating = false;
                // Schedule next check even on error
                const timer = setTimeout(() => updateIncursions(client), nextCheckDelay);
                esiTimers.set('incursions', timer);
                return;
            }

            const enrichedIncursions = [];
            for (const incursion of allIncursions) {
                try {
                    const { data: systemData } = await esiService.get({
                        endpoint: `/universe/systems/${incursion.staging_solar_system_id}/`,
                        caller: __filename
                    });
                    enrichedIncursions.push({ ...incursion, systemData });
                } catch (e) {
                    logger.warn(`Could not resolve system ID ${incursion.staging_solar_system_id}. Error: ${e.message}`);
                }
            }
            highSecIncursion = enrichedIncursions.find(inc => inc.systemData && inc.systemData.security_status > 0.45);
        }

        const currentStateKey = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';

        if (currentStateKey === state.lastIncursionState && !isManualRefresh && !isUsingMock) {
            logger.info('No change in high-sec incursion state.');
            isUpdating = false;
            // Schedule the next check
            const timer = setTimeout(() => updateIncursions(client), nextCheckDelay);
            esiTimers.set('incursions', timer);
            logger.info(`Next incursion check scheduled in ${Math.round(nextCheckDelay / 1000)}s.`);
            return;
        }
        logger.info('High-sec incursion state has changed or manual/mock update triggered. Updating...');

        const currentSimpleState = highSecIncursion ? highSecIncursion.state : 'none';
        const currentConstellationId = highSecIncursion ? highSecIncursion.constellation_id : null;
        let lastSimpleState = 'none';
        let lastConstellationId = null;
        let isNewSpawn = false; // This ensures the variable always exists.

        if (state.lastIncursionState && state.lastIncursionState !== 'none') {
            const parts = state.lastIncursionState.split('-');
            lastConstellationId = parseInt(parts[0], 10);
            lastSimpleState = parts[1];
        }

        if (!isUsingMock) {
            const now = Math.floor(Date.now() / 1000);
            if (currentConstellationId && currentConstellationId !== lastConstellationId) {
                isNewSpawn = true;
                state.spawnTimestamp = now;
                state.mobilizingTimestamp = null;
                state.withdrawingTimestamp = null;
                state.endedTimestamp = null;
                state.lastIncursionStats = null;
            } else if (currentConstellationId && currentConstellationId === lastConstellationId && currentSimpleState !== lastSimpleState) {
                if (currentSimpleState === 'mobilizing') state.mobilizingTimestamp = now;
                if (currentSimpleState === 'withdrawing') state.withdrawingTimestamp = now;
            } else if (currentSimpleState === 'none' && lastSimpleState !== 'none') {
                state.endedTimestamp = now;
                const lastSpawnData = incursionSystems.find(c => c.Constellation_id === lastConstellationId);
                if (lastSpawnData) state.lastHqSystemId = lastSpawnData.dock_up_system_id;
                // The calculation will now happen in the block below.
            }

            // Recalculate stats if the incursion is over.
            // This runs when an incursion ends, AND on manual refreshes if the last incursion is over.
            if (currentSimpleState === 'none' && state.endedTimestamp) {
                state.lastIncursionStats = calculateLastIncursionStats(state);
            }
        }
        state.lastIncursionState = currentStateKey;

        let embed;
        if (highSecIncursion) {
            embed = await buildActiveIncursionEmbed(highSecIncursion, state, config, isUsingMock, mockOverride);
        } else {
            embed = buildNoIncursionEmbed(state);
        }

        const channelId = config.incursionChannelId[0]; // Extract ID for clarity
        const channel = await client.channels.fetch(channelId);

        if (isNewSpawn) {
            if (state.incursionMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(state.incursionMessageId);
                    await oldMessage.delete();
                } catch (error) {
                    logger.warn(`Could not delete old incursion message: ${error.message}`);
                }
            }
            const newMessage = await channel.send({ content: '@everyone, a new high-sec incursion has spawned!', embeds: [embed] });
            state.incursionMessageId = newMessage.id;
        } else {
            const messagePayload = { content: ' ', embeds: [embed] };
            if (state.incursionMessageId) {
                try {
                    const message = await channel.messages.fetch(state.incursionMessageId);
                    await message.edit(messagePayload);
                } catch {
                    const newMessage = await channel.send(messagePayload);
                    state.incursionMessageId = newMessage.id;
                }
            } else {
                const newMessage = await channel.send(messagePayload);
                state.incursionMessageId = newMessage.id;
            }
        }

        await writeState(state);

        // Schedule the next check after a successful update
        const timer = setTimeout(() => updateIncursions(client), nextCheckDelay);
        esiTimers.set('incursions', timer);
        logger.info(`Next incursion check scheduled in ${Math.round(nextCheckDelay / 1000)}s.`);

    } catch (error) {
        const channelId = config.incursionChannelId ? config.incursionChannelId[0] : 'NOT CONFIGURED';
        if (error.code === 50001) { // Missing Access
            logger.error(`FATAL: Bot is missing access to the configured incursion channel (ID: ${channelId}).\n` +
                'Troubleshooting Steps:\n' +
                "1. Verify this Channel ID is correct in your 'config' database table.\n" +
                "2. Ensure the bot is a member of the server where this channel exists.\n" +
                "3. Check the bot's permissions for the channel itself. It needs 'View Channel', 'Send Messages', and 'Embed Links'.\n" +
                "4. Check the permissions for the category the channel is in. A 'deny' permission on the category can override channel settings.\n" +
                "5. Check all of the bot's roles. A role with a 'deny' permission can override another role that grants permission.");
            return; // Stop execution if we can't post
        }
        if (error.code === 10003) { // Unknown Channel
            logger.error(`FATAL: The configured incursion channel (ID: ${channelId}) does not exist. Please check the channel ID in your config.`);
            return;
        }

        const status = error.response?.status;
        if (status && [502, 503, 504].includes(status)) {
            // This is an expected downtime error, so we log it gently and exit.
            logger.info(`ESI appears to be offline (Status ${status}). Skipping incursion check.`);
        } else {
            // This is an unexpected error, so we log it fully.
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`Error during incursion update: ${errorMessage}`, error.stack);
        }
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };
