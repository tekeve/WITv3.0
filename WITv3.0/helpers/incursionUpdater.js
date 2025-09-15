const { EmbedBuilder } = require('discord.js');
const logger = require('@helpers/logger');
const db = require('@helpers/dbService');
const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const esiService = require('@helpers/esiService');

// Color map for incursion states
const stateColors = {
    established: 0x3BA55D, // Green
    mobilizing: 0xFFEA00,  // Yellow
    withdrawing: 0xFFA500, // Orange
    none: 0xED4245         // Red
};

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

function formatDuration(seconds) {
    if (seconds === null || seconds < 0) return 'N/A';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    let str = '';
    if (d > 0) str += `${d}d `;
    if (h > 0) str += `${h}h `;
    if (m > 0 || str === '') str += `${m}m`;
    return str.trim();
}


let isUpdating = false;

async function updateIncursions(client, options = {}) {
    if (isUpdating) {
        logger.info('Update already in progress, skipping this cycle.');
        return;
    }
    isUpdating = true;
    logger.info('Checking for incursion updates from ESI...');

    const state = await readState();
    const config = configManager.get();
    const incursionSystems = incursionManager.get();
    const { isManualRefresh = false } = options;

    if (!config.incursionChannelId) {
        logger.warn('incursionChannelId is not configured in the database. Skipping update.');
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
                        systemData: { security_status: 0.8 } // Assume highsec
                    };
                } else {
                    highSecIncursion = null;
                }
            }
        } else {
            if (mockOverride) {
                logger.info('Mock override has expired. Deleting it and resuming ESI updates.');
                client.mockOverride = null;
            }
            const allIncursions = await esiService.get('/incursions/');

            // Add defensive check to ensure the response is an array
            if (!Array.isArray(allIncursions)) {
                // Safely log the actual response from ESI to diagnose the issue.
                logger.error(`The ESI /incursions/ endpoint did not return an array as expected. Aborting update cycle. Raw Response:`, allIncursions);
                isUpdating = false; // Release the lock
                return; // Exit the function gracefully
            }

            const enrichedIncursions = [];
            for (const incursion of allIncursions) {
                try {
                    const systemData = await esiService.get(`/universe/systems/${incursion.staging_solar_system_id}/`);
                    enrichedIncursions.push({ ...incursion, systemData });
                } catch (e) {
                    // Log the specific error from esiService, which now includes more context
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
            const spawnData = incursionSystems.find(c => c.Constellation_id === highSecIncursion.constellation_id);
            if (!spawnData) throw new Error(`No matching spawn data for Constellation ID: ${highSecIncursion.constellation_id}`);

            const currentHqId = spawnData.dock_up_system_id;
            const hqSystemFullName = spawnData.headquarters_system;
            const hqSystemName = hqSystemFullName.split(' (')[0];

            logger.info(`Checking for last HQ route. Current HQ ID: ${currentHqId}, Last HQ ID: ${state.lastHqSystemId}`);

            const jumpPromises = Object.entries(config.tradeHubs).map(async ([name, id]) => {
                const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${name}:${hqSystemName}:secure`;
                const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${name}:${hqSystemName}:shortest`;
                const secureEsiUrl = `/route/${id}/${currentHqId}/?flag=secure`;
                const shortestEsiUrl = `/route/${id}/${currentHqId}/?flag=shortest`;
                try {
                    const [secureRes, shortestRes] = await Promise.all([
                        esiService.get(secureEsiUrl),
                        esiService.get(shortestEsiUrl)
                    ]);
                    const secureJumps = secureRes.length - 1;
                    const shortestJumps = shortestRes.length - 1;
                    if (secureJumps === shortestJumps) {
                        return { name, jumps: `[${secureJumps}j (safest)](${secureGatecheckUrl})` };
                    }
                    return { name, jumps: `[${secureJumps}j (safest)](${secureGatecheckUrl}) / [${shortestJumps}j (shortest)](${shortestGatecheckUrl})` };
                } catch { return { name, jumps: 'N/A' }; }
            });

            const jumpCounts = await Promise.all(jumpPromises);
            const tradeHubJumpsString = jumpCounts.map(hub => `**${hub.name}**:\n${hub.jumps}`).join('\n');
            const formatSystemLinks = (systemString) => !systemString ? 'None' : systemString.split(',').map(name => `[${name.trim()}](https://evemaps.dotlan.net/system/${encodeURIComponent(name.trim())})`).join(', ');

            const timelineParts = [];
            const spawnTimestamp = isUsingMock && mockOverride.spawnTimestamp ? mockOverride.spawnTimestamp : state.spawnTimestamp;
            const mobilizingTimestamp = isUsingMock && mockOverride.mobilizingTimestamp ? mockOverride.mobilizingTimestamp : state.mobilizingTimestamp;
            const withdrawingTimestamp = isUsingMock && mockOverride.withdrawingTimestamp ? mockOverride.withdrawingTimestamp : state.withdrawingTimestamp;

            if (spawnTimestamp) {
                timelineParts.push(`Spawned: <t:${spawnTimestamp}:R>`);
                timelineParts.push(`Mothership: <t:${spawnTimestamp + (3 * 24 * 3600)}:R>`);
            }
            if (mobilizingTimestamp) {
                timelineParts.push(`Mobilizing: <t:${mobilizingTimestamp}:R>`);
                timelineParts.push(`Despawns by: <t:${mobilizingTimestamp + (3 * 24 * 3600)}:R>`);
            }
            if (withdrawingTimestamp) {
                timelineParts.push(`Withdrawing: <t:${withdrawingTimestamp}:R>`);
            }
            const timelineString = timelineParts.length > 0 ? timelineParts.join('\n') : 'Calculating...';

            embed = new EmbedBuilder()
                .setColor(stateColors[highSecIncursion.state] || stateColors.none)
                .setTitle(`High-Sec Incursion: **${spawnData.Constellation}**`)
                .setDescription(`Spawning in the [**${spawnData.region}**](https://evemaps.dotlan.net/region/${encodeURIComponent(spawnData.region)}) region.`)
                .setThumbnail(spawnData.region_faction ? `https://images.evetech.net/corporations/${spawnData.region_faction}/logo?size=128` : null);

            const fields = [
                { name: 'Suggested Dockup', value: `${spawnData.dockup}`, inline: true },
                { name: 'Current State', value: `${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}`, inline: true },
                { name: 'Incursion Timeline', value: timelineString, inline: true },
                { name: 'Headquarters', value: `[${hqSystemFullName}](https://evemaps.dotlan.net/system/${encodeURIComponent(hqSystemName)})`, inline: true },
                { name: 'Assaults', value: formatSystemLinks(spawnData.assault_systems), inline: true },
                { name: 'Vanguards', value: formatSystemLinks(spawnData.vanguard_systems), inline: true },
                { name: 'Routes from Trade Hubs', value: tradeHubJumpsString, inline: true }
            ];

            if (state.lastHqSystemId && state.lastHqSystemId !== currentHqId) {
                let routeString = 'N/A';
                const lastHqNameData = incursionSystems.find(sys => sys.dock_up_system_id === state.lastHqSystemId);

                if (lastHqNameData) {
                    const lastHqName = lastHqNameData.headquarters_system.split(' (')[0];
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:shortest`;
                    const secureEsiUrl = `/route/${state.lastHqSystemId}/${currentHqId}/?flag=secure`;
                    const shortestEsiUrl = `/route/${state.lastHqSystemId}/${currentHqId}/?flag=shortest`;

                    try {
                        const [secureRes, shortestRes] = await Promise.all([
                            esiService.get(secureEsiUrl),
                            esiService.get(shortestEsiUrl)
                        ]);

                        const secureJumps = secureRes ? secureRes.length - 1 : null;
                        const shortestJumps = shortestRes ? shortestRes.length - 1 : null;

                        if (secureJumps !== null && secureJumps === shortestJumps) {
                            routeString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl})`;
                        } else if (secureJumps !== null && shortestJumps !== null) {
                            routeString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl}) / [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                        } else if (secureJumps !== null) {
                            routeString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl})`;
                        } else if (shortestJumps !== null) {
                            routeString = `**${lastHqName}**: [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                        } else {
                            routeString = `**${lastHqName}**: No Stargate Route`;
                        }
                    } catch (error) {
                        if (error.message && error.message.includes("No route found")) {
                            routeString = `**${lastHqName}**: No Stargate Route`;
                        } else {
                            logger.error(`Failed to get route from last HQ: ${error.message}`);
                            routeString = `**${lastHqName}**: N/A`;
                        }
                    }
                }
                fields.push({ name: '\u200b', value: '\u200b', inline: true }); // Spacer
                fields.push({ name: 'Route from Last HQ', value: routeString, inline: true });
            }

            embed.addFields(fields)
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' }).setTimestamp();

        } else {
            embed = new EmbedBuilder()
                .setColor(stateColors.none)
                .setTitle('No High-Sec Incursion Active')
                .setDescription('The High-Security incursion is not currently active. Fly safe!')
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' }).setTimestamp();

            if (state.endedTimestamp) {
                const windowOpen = state.endedTimestamp + (12 * 3600);
                const windowClose = windowOpen + (24 * 3600);
                embed.addFields({ name: 'Next Spawn Window', value: `Opens: <t:${windowOpen}:R>\nCloses: <t:${windowClose}:R>` });
            }
            if (state.lastIncursionStats) {
                embed.addFields({ name: 'Last Incursion Report', value: '\u200b' });
                embed.addFields(
                    { name: 'Total Duration', value: state.lastIncursionStats.totalDuration, inline: true },
                    { name: 'Established Phase', value: `${state.lastIncursionStats.establishedDuration} (${state.lastIncursionStats.establishedUsagePercentage} used)`, inline: true },
                );
            }
        }

        const channel = await client.channels.fetch(config.incursionChannelId);

        if (isNewSpawn) {
            if (state.incursionMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(state.incursionMessageId);
                    await oldMessage.delete();
                    logger.info(`Deleted old incursion message: ${state.incursionMessageId}`);
                } catch (error) {
                    logger.warn(`Could not delete old incursion message (it may have been deleted): ${error.message}`);
                }
            }
            const messagePayload = {
                content: '@everyone, a new high-sec incursion has spawned!',
                embeds: [embed]
            };
            const newMessage = await channel.send(messagePayload);
            state.incursionMessageId = newMessage.id;
        } else {
            const messagePayload = { content: ' ', embeds: [embed] };
            if (state.incursionMessageId) {
                try {
                    const message = await channel.messages.fetch(state.incursionMessageId);
                    await message.edit(messagePayload);
                } catch (error) {
                    logger.warn(`Could not edit incursion message, sending a new one: ${error.message}`);
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
        // Updated error logging to be safer and prevent circular JSON errors
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`An unexpected error occurred during incursion update: ${errorMessage}`, error.stack);
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };

