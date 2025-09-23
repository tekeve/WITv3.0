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
    if (state.mobilizingTimestamp) {
        const establishedDurSeconds = state.mobilizingTimestamp - state.spawnTimestamp;
        const maxEstablishedSeconds = 5 * 24 * 3600; // Max duration is ~5 days
        const percentage = (establishedDurSeconds / maxEstablishedSeconds) * 100;
        stats.establishedPhase = `${formatDuration(establishedDurSeconds)} (${parseFloat(percentage.toFixed(2))}% of max)`;
    }

    // --- Mobilizing Phase Duration ---
    if (state.mobilizingTimestamp) {
        const mobilizingEnd = state.withdrawingTimestamp || ended;
        const mobilizingDurSeconds = mobilizingEnd - state.mobilizingTimestamp;
        const maxMobilizingSeconds = 2 * 24 * 3600; // 48 hours
        const percentage = (mobilizingDurSeconds / maxMobilizingSeconds) * 100;
        stats.mobilizingPhase = `${formatDuration(mobilizingDurSeconds)} (${parseFloat(percentage.toFixed(2))}% used)`;
    }

    // --- Withdrawing Period Used ---
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

/**
 * Schedules the next check for the /incursions endpoint.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {number} delay The delay in milliseconds before the next check.
 */
function scheduleNextIncursionCheck(client, delay) {
    if (esiTimers.has('incursions')) {
        clearTimeout(esiTimers.get('incursions'));
    }
    const safeDelay = Math.max(delay, 10000); // Enforce a minimum 10-second delay
    const timer = setTimeout(() => updateIncursions(client), safeDelay);
    esiTimers.set('incursions', timer);
    logger.info(`Next incursion check scheduled in ${Math.round(safeDelay / 1000)}s.`);
}

/**
 * Fetches the main incursion list and finds the active high-sec incursion, enriching it with system data.
 * @returns {Promise<{ highSecIncursion: object | null, nextCheckDelay: number }>}
 */
async function fetchHighSecIncursion() {
    let nextCheckDelay = 60 * 1000; // Default to 60 seconds

    // This will now throw an error on ESI failure after retries, instead of returning null.
    const { data: allIncursions, expires: incursionsExpiry } = await esiService.get({ endpoint: '/incursions/', caller: __filename });

    if (incursionsExpiry) {
        const buffer = 5000; // 5-second buffer
        nextCheckDelay = (incursionsExpiry - Date.now()) + buffer;
    }

    if (!Array.isArray(allIncursions)) {
        logger.error(`ESI /incursions/ endpoint did not return an array. Response:`, allIncursions);
        return { highSecIncursion: null, nextCheckDelay };
    }

    const incursionSystems = incursionManager.get();
    const highSecConstellationIds = new Set(incursionSystems.map(s => s.Constellation_id));

    for (const incursion of allIncursions) {
        if (highSecConstellationIds.has(incursion.constellation_id)) {
            try {
                const { data: systemData } = await esiService.get({
                    endpoint: `/universe/systems/${incursion.staging_solar_system_id}/`,
                    caller: __filename
                });

                if (systemData && systemData.security_status > 0.45) {
                    const highSecIncursion = { ...incursion, systemData };
                    return { highSecIncursion, nextCheckDelay };
                }
            } catch (e) {
                logger.warn(`Could not resolve system ID ${incursion.staging_solar_system_id} for potential HS incursion. Error: ${e.message}`);
            }
        }
    }
    return { highSecIncursion: null, nextCheckDelay };
}

async function updateIncursions(client, options = {}) {
    if (isUpdating) {
        logger.info('Update already in progress, skipping this cycle.');
        return;
    }
    isUpdating = true;
    logger.info('Checking for incursion updates...');

    const state = await readState();
    const config = configManager.get();
    const { isManualRefresh = false } = options;

    if (!config.incursionChannelId) {
        logger.warn('incursionChannelId is not configured. Skipping update.');
        isUpdating = false;
        return;
    }

    try {
        let highSecIncursion;
        let nextCheckDelay = 60 * 1000; // Default delay
        const mockOverride = client.mockOverride;
        const isUsingMock = mockOverride && mockOverride.expires > Date.now();

        if (isUsingMock) {
            logger.info(`Using mock state override: ${JSON.stringify(mockOverride)}`);
            if (mockOverride.state === 'none') {
                highSecIncursion = null;
            } else {
                const incursionSystems = incursionManager.get();
                const spawnData = incursionSystems.find(c => c.Constellation.toLowerCase() === mockOverride.constellationName.toLowerCase());
                if (spawnData) {
                    highSecIncursion = {
                        constellation_id: parseInt(spawnData.Constellation_id, 10),
                        state: mockOverride.state,
                        staging_solar_system_id: parseInt(spawnData.dock_up_system_id, 10),
                        faction_id: parseInt(spawnData.region_faction, 10),
                        systemData: { security_status: 0.8 }
                    };
                }
            }
        } else {
            if (mockOverride) {
                logger.info('Mock override has expired. Resuming ESI updates.');
                client.mockOverride = null;
            }
            const result = await fetchHighSecIncursion();
            highSecIncursion = result.highSecIncursion;
            nextCheckDelay = result.nextCheckDelay;
        }

        scheduleNextIncursionCheck(client, nextCheckDelay);

        const currentStateKey = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';

        if (currentStateKey === state.lastIncursionState && !isManualRefresh) {
            logger.info('No change in high-sec incursion state.');
            isUpdating = false;
            return;
        }
        logger.info('High-sec incursion state has changed or manual/mock update triggered. Updating...');

        const currentSimpleState = highSecIncursion ? highSecIncursion.state : 'none';
        const currentConstellationId = highSecIncursion ? highSecIncursion.constellation_id : null;
        let lastSimpleState = 'none';
        let lastConstellationId = null;
        let isNewSpawn = false;

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
                const incursionSystems = incursionManager.get();
                const lastSpawnData = incursionSystems.find(c => c.Constellation_id === lastConstellationId);
                if (lastSpawnData) state.lastHqSystemId = lastSpawnData.dock_up_system_id;
            }

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

        const channelId = config.incursionChannelId[0];
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

    } catch (error) {
        const status = error.response?.status;
        if (status && [420, 502, 503, 504].includes(status)) {
            // This is a temporary ESI error.
            logger.info(`ESI service unavailable during update (Status ${status}). Aborting this update cycle, state will not be changed.`);
            // CRUCIAL: Don't change the state. Just schedule the next check using the last known delay.
            scheduleNextIncursionCheck(client, 60 * 1000);
        } else {
            // This is a different, more serious error. Log it fully.
            const channelId = config.incursionChannelId ? config.incursionChannelId[0] : 'NOT CONFIGURED';
            if (error.code === 50001) {
                logger.error(`FATAL: Bot is missing access to the configured incursion channel (ID: ${channelId}).`);
                isUpdating = false;
                return;
            }
            if (error.code === 10003) {
                logger.error(`FATAL: The configured incursion channel (ID: ${channelId}) does not exist.`);
                isUpdating = false;
                return;
            }
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`An unexpected error occurred during incursion update: ${errorMessage}`, error.stack);
            scheduleNextIncursionCheck(client, 60 * 1000);
        }
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };
