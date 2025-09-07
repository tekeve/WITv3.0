require('dotenv').config();
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

const incursionSystems = require('./incursionsystem.json');

// Color map for incursion states
const stateColors = {
    established: 0x3BA55D, // Green
    mobilizing: 0xFFEA00,  // Yellow
    withdrawing: 0xFFA500, // Orange
    none: 0xED4245         // Red
};

// Helper to read state from the database
async function readState() {
    try {
        const rows = await db.query('SELECT * FROM incursion_state WHERE id = 1');
        if (rows.length > 0) {
            // The stats are stored as a JSON string, so we need to parse it.
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
        return {}; // Return empty object if no state row exists
    } catch (error) {
        logger.error('Failed to read incursion state from database:', error);
        return {};
    }
}

// Helper to write state to the database
async function writeState(state) {
    try {
        // Ensure stats are stringified for storage
        const statsToStore = state.lastIncursionStats ? JSON.stringify(state.lastIncursionStats) : null;

        const sql = `
            INSERT INTO incursion_state (
                id, lastIncursionState, incursionMessageId, lastHqSystemId, 
                spawnTimestamp, mobilizingTimestamp, withdrawingTimestamp, 
                endedTimestamp, lastIncursionStats
            ) VALUES (
                1, ?, ?, ?, ?, ?, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE 
                lastIncursionState = VALUES(lastIncursionState),
                incursionMessageId = VALUES(incursionMessageId),
                lastHqSystemId = VALUES(lastHqSystemId),
                spawnTimestamp = VALUES(spawnTimestamp),
                mobilizingTimestamp = VALUES(mobilizingTimestamp),
                withdrawingTimestamp = VALUES(withdrawingTimestamp),
                endedTimestamp = VALUES(endedTimestamp),
                lastIncursionStats = VALUES(lastIncursionStats)
        `;

        await db.query(sql, [
            state.lastIncursionState || null,
            state.incursionMessageId || null,
            state.lastHqSystemId || null,
            state.spawnTimestamp || null,
            state.mobilizingTimestamp || null,
            state.withdrawingTimestamp || null,
            state.endedTimestamp || null,
            statsToStore
        ]);
    } catch (error) {
        logger.error('Failed to save incursion state to database:', error);
    }
}

// Helper to format seconds into a readable string (e.g., 2d 5h 10m)
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

async function updateIncursions(client, options = {}) {
    if (isUpdating) {
        logger.info('Update already in progress, skipping this cycle.');
        return;
    }
    isUpdating = true;

    // Load state at the beginning of each run
    const state = await readState();
    logger.info('Current state from database:', state);
    const { isManualRefresh = false } = options;

    try {
        let highSecIncursion;
        const mockOverride = client.mockOverride; // Use in-memory mock

        const isUsingMock = mockOverride && mockOverride.expires > Date.now();

        if (isUsingMock) {
            logger.info(`Using mock state override: ${JSON.stringify(mockOverride)}`);
            if (mockOverride.state === 'none') {
                highSecIncursion = null;
            } else {
                const spawnData = incursionSystems.find(c => c.Constellation.toLowerCase() === mockOverride.constellationName.toLowerCase());
                if (spawnData) {
                    highSecIncursion = {
                        constellation_id: spawnData.ConstellationID,
                        state: mockOverride.state,
                        staging_solar_system_id: spawnData['Dock Up System'],
                        faction_id: spawnData['FACTION ID'],
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

            logger.info('Checking for incursion updates from ESI...');
            const response = await axios.get('https://esi.evetech.net/latest/incursions/', { timeout: 5000 });
            const allIncursions = response.data;

            const getSystemData = async (systemId) => {
                const sysResponse = await axios.get(`https://esi.evetech.net/latest/universe/systems/${systemId}/`, { timeout: 5000 });
                return sysResponse.data;
            };

            const enrichedIncursions = await Promise.all(allIncursions.map(async (incursion) => {
                try {
                    const systemData = await getSystemData(incursion.staging_solar_system_id);
                    // Add detailed logging for each system fetched
                    logger.info(`Enriching constellation ${incursion.constellation_id}: Staging system ${systemData.name} (${incursion.staging_solar_system_id}), Security: ${systemData.security_status}`);
                    return { ...incursion, systemData };
                } catch (e) {
                    logger.error(`Could not resolve system ID ${incursion.staging_solar_system_id}:`, e.message);
                    return { ...incursion, systemData: null };
                }
            }));

            // Correct the security status check to be more inclusive of high-sec systems
            highSecIncursion = enrichedIncursions.find(inc => inc.systemData && inc.systemData.security_status > 0.45);
            logger.info(`Final high-sec incursion object after filtering: ${JSON.stringify(highSecIncursion || 'None')}`);
        }

        const currentStateKey = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';

        logger.info(`Comparing current key '${currentStateKey}' with last known state key '${state.lastIncursionState}'`);

        if (currentStateKey === state.lastIncursionState && !isManualRefresh && !isUsingMock) {
            logger.info('No change in high-sec incursion state.');
            isUpdating = false;
            return;
        }

        logger.info('High-sec incursion state has changed or manual/mock update triggered. Updating...');

        const currentSimpleState = highSecIncursion ? highSecIncursion.state : 'none';
        const currentConstellationId = highSecIncursion ? highSecIncursion.constellation_id : null;

        // Safely parse the last known state from the database
        let lastSimpleState = 'none';
        let lastConstellationId = null;
        if (state.lastIncursionState && state.lastIncursionState !== 'none') {
            const parts = state.lastIncursionState.split('-');
            lastConstellationId = parseInt(parts[0], 10);
            lastSimpleState = parts[1];
        }

        if (!isUsingMock) {
            const now = Math.floor(Date.now() / 1000);

            // A new constellation has spawned
            if (currentConstellationId && currentConstellationId !== lastConstellationId) {
                state.spawnTimestamp = now;
                state.mobilizingTimestamp = null;
                state.withdrawingTimestamp = null;
                state.endedTimestamp = null;
                state.lastIncursionStats = null;
            }
            // State transition within the same constellation
            else if (currentConstellationId && currentConstellationId === lastConstellationId && currentSimpleState !== lastSimpleState) {
                if (currentSimpleState === 'mobilizing') state.mobilizingTimestamp = now;
                if (currentSimpleState === 'withdrawing') state.withdrawingTimestamp = now;
            }
            // Incursion has ended
            else if (currentSimpleState === 'none' && lastSimpleState !== 'none') {
                state.endedTimestamp = now;
                const lastSpawnData = incursionSystems.find(c => c['ConstellationID'] === lastConstellationId);
                if (lastSpawnData) state.lastHqSystemId = lastSpawnData['Dock Up System'];

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
            const spawnData = incursionSystems.find(constellation => constellation['ConstellationID'] === highSecIncursion.constellation_id);
            if (!spawnData) throw new Error(`No matching spawn data found for Constellation ID: ${highSecIncursion.constellation_id}`);

            const currentHqId = spawnData['Dock Up System'];
            const hqSystemName = spawnData['Headquarter System'].split(' (')[0];

            const jumpPromises = Object.entries(config.tradeHubs).map(async ([name, id]) => {
                const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${name}:${hqSystemName}:secure`;
                const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${name}:${hqSystemName}:shortest`;
                const secureEsiUrl = `https://esi.evetech.net/v1/route/${id}/${currentHqId}/?flag=secure`;
                const shortestEsiUrl = `https://esi.evetech.net/v1/route/${id}/${currentHqId}/?flag=shortest`;
                const results = await Promise.allSettled([axios.get(secureEsiUrl), axios.get(shortestEsiUrl)]);
                if (results[0].status === 'rejected') return { name, jumps: 'N/A' };
                const secureJumps = results[0].value.data.length - 1;
                if (results[1].status === 'rejected' || secureJumps === (results[1].value.data.length - 1)) {
                    return { name, jumps: `[${secureJumps}j (safest)](${secureGatecheckUrl})` };
                }
                const shortestJumps = results[1].value.data.length - 1;
                return { name, jumps: `[${secureJumps}j (safest)](${secureGatecheckUrl}) / [${shortestJumps}j (shortest)](${shortestGatecheckUrl})` };
            });

            const jumpCounts = await Promise.all(jumpPromises);
            const tradeHubJumpsString = jumpCounts.map(hub => `**${hub.name}**: ${hub.jumps}`).join('\n');

            let lastHqRouteString = '';
            if (state.lastHqSystemId && state.lastHqSystemId !== currentHqId) {
                const lastHqNameData = incursionSystems.find(sys => sys['Dock Up System'] === state.lastHqSystemId);
                const lastHqName = lastHqNameData ? lastHqNameData['Headquarter System'].split(' (')[0] : 'Last HQ';
                const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:secure`;
                const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:shortest`;
                const secureEsiUrl = `https://esi.evetech.net/v1/route/${state.lastHqSystemId}/${currentHqId}/?flag=secure`;
                const shortestEsiUrl = `https://esi.evetech.net/v1/route/${state.lastHqSystemId}/${currentHqId}/?flag=shortest`;
                const results = await Promise.allSettled([axios.get(secureEsiUrl), axios.get(shortestEsiUrl)]);
                if (results[0].status === 'fulfilled') {
                    const secureJumps = results[0].value.data.length - 1;
                    if (results[1].status === 'rejected' || secureJumps === (results[1].value.data.length - 1)) {
                        lastHqRouteString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl})`;
                    } else {
                        const shortestJumps = results[1].value.data.length - 1;
                        lastHqRouteString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl}) / [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                    }
                } else {
                    lastHqRouteString = `**${lastHqName}**: N/A`;
                }
            }

            const formatSystemLinks = (systemString) => !systemString ? 'None' : systemString.split(',').map(name => `[${name.trim()}](https://evemaps.dotlan.net/system/${encodeURIComponent(name.trim())})`).join(', ');

            const timelineParts = [];
            const spawnTimestamp = isUsingMock && mockOverride.spawnTimestamp ? mockOverride.spawnTimestamp : state.spawnTimestamp;
            const mobilizingTimestamp = isUsingMock && mockOverride.mobilizingTimestamp ? mockOverride.mobilizingTimestamp : state.mobilizingTimestamp;
            const withdrawingTimestamp = isUsingMock && mockOverride.withdrawingTimestamp ? mockOverride.withdrawingTimestamp : state.withdrawingTimestamp;

            if (spawnTimestamp) {
                const momSpawnTime = spawnTimestamp + (3 * 24 * 3600);
                timelineParts.push(`Spawned: <t:${spawnTimestamp}:R>`);
                timelineParts.push(`Mothership: <t:${momSpawnTime}:R>`);
            }
            if (mobilizingTimestamp) {
                const despawnTime = mobilizingTimestamp + (3 * 24 * 3600);
                timelineParts.push(`Mobilizing: <t:${mobilizingTimestamp}:R>`);
                timelineParts.push(`Despawns by: <t:${despawnTime}:R>`);
            }
            if (withdrawingTimestamp) {
                timelineParts.push(`Withdrawing: <t:${withdrawingTimestamp}:R>`);
            }

            const timelineString = timelineParts.length > 0 ? timelineParts.join('\n') : 'Calculating...';

            embed = new EmbedBuilder()
                .setColor(stateColors[highSecIncursion.state] || stateColors.none)
                .setTitle(`High-Sec Incursion: **${spawnData.Constellation}**`)
                .setDescription(`Spawning in the [**${spawnData.REGION}**](https://evemaps.dotlan.net/region/${encodeURIComponent(spawnData.REGION)}) region.`)
                .setThumbnail(`https://images.evetech.net/corporations/${spawnData['FACTION ID']}/logo?size=128`)
                .addFields(
                    { name: 'Suggested Dockup', value: `${spawnData.Dockup}`, inline: true },
                    { name: 'Current State', value: `${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}`, inline: true },
                    { name: 'Incursion Timeline', value: timelineString, inline: true },
                    { name: 'Headquarters', value: `[${spawnData['Headquarter System']}](https://evemaps.dotlan.net/system/${encodeURIComponent(hqSystemName)})`, inline: true },
                    { name: 'Assaults', value: formatSystemLinks(spawnData['Assault Systems']), inline: true },
                    { name: 'Vanguards', value: formatSystemLinks(spawnData['Vanguard Systems']), inline: true },
                    { name: 'Routes from Trade Hubs', value: tradeHubJumpsString, inline: true },
                )
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' })
                .setTimestamp();

            if (lastHqRouteString) {
                embed.addFields(
                    { name: '\u200b', value: '\u200b', inline: true },
                    { name: 'Route from Last HQ', value: lastHqRouteString, inline: true }
                );
            }
        } else {
            embed = new EmbedBuilder()
                .setColor(stateColors.none)
                .setTitle('No High-Sec Incursion Active')
                .setDescription('The High-Security incursion is not currently active. Fly safe!')
                .setImage('https://cdn.discordapp.com/banners/295568584409743361/736f561f52f927ebe2d64604fea336d5.webp?size=480')
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' })
                .setTimestamp();

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

        const channel = await client.channels.fetch(process.env.INCURSION_CHANNEL_ID);
        const messagePayload = { content: ' ', embeds: [embed] };
        if (state.incursionMessageId) {
            try {
                const message = await channel.messages.fetch(state.incursionMessageId);
                await message.edit(messagePayload);
            } catch (error) {
                const newMessage = await channel.send(messagePayload);
                state.incursionMessageId = newMessage.id;
            }
        } else {
            const newMessage = await channel.send(messagePayload);
            state.incursionMessageId = newMessage.id;
        }

        await writeState(state);

    } catch (error) {
        logger.error('An unexpected error occurred during incursion update:', error);
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

let isUpdating = false;

module.exports = { updateIncursions };

