const logger = require('@helpers/logger');
const db = require('@helpers/database');
const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const esiService = require('@helpers/esiService');
const { buildActiveIncursionEmbed, buildNoIncursionEmbed, formatDuration } = require('@embeds/incursionEmbed');

async function readState() {
    try {
        const rows = await db.query('SELECT * FROM incursion_state WHERE id = 1');
        if (rows.length > 0) {
            const state = rows[0];
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
            const allIncursions = await esiService.get('/incursions/');
            if (!Array.isArray(allIncursions)) {
                logger.error(`ESI /incursions/ endpoint did not return an array. Response:`, allIncursions);
                isUpdating = false;
                return;
            }

            const enrichedIncursions = [];
            for (const incursion of allIncursions) {
                try {
                    const systemData = await esiService.get(`/universe/systems/${incursion.staging_solar_system_id}/`);
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
                const lastSpawnData = incursionSystems.find(c => c.Constellation_id === lastConstellationId);
                if (lastSpawnData) state.lastHqSystemId = lastSpawnData.dock_up_system_id;
                if (state.spawnTimestamp) {
                    const establishedDur = (state.mobilizingTimestamp || now) - state.spawnTimestamp;
                    const mobilizingDur = state.mobilizingTimestamp ? (state.withdrawingTimestamp || now) - state.mobilizingTimestamp : null;
                    const establishedUsage = Math.round((establishedDur / (5 * 24 * 3600)) * 100);
                    state.lastIncursionStats = {
                        totalDuration: formatDuration(now - state.spawnTimestamp),
                        establishedDuration: formatDuration(establishedDur),
                        mobilizingDuration: formatDuration(mobilizingDur),
                        withdrawingDuration: formatDuration(state.withdrawingTimestamp ? now - state.withdrawingTimestamp : null),
                        establishedUsagePercentage: `${establishedUsage}%`
                    };
                }
            }
        }
        state.lastIncursionState = currentStateKey;

        let embed;
        if (highSecIncursion) {
            embed = await buildActiveIncursionEmbed(highSecIncursion, state, config, isUsingMock, mockOverride);
        } else {
            embed = buildNoIncursionEmbed(state);
        }

        const channel = await client.channels.fetch(config.incursionChannelId);

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
