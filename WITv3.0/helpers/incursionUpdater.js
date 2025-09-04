require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const logger = require('@helpers/logger');

const STATE_FILE = path.join(__dirname, '..', 'state.json');
let isUpdating = false;
const incursionSystems = require('./incursionsystem.json');

// Color map for incursion states
const stateColors = {
    established: 0x3BA55D, // Green
    mobilizing: 0xFFEA00,  // Yellow
    withdrawing: 0xFFA500, // Orange
    none: 0xED4245         // Red
};

// Helper to read state from the file
function readState() {
    try {
        const rawData = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        logger.info('State file not found or invalid, creating a fresh state.');
        return {};
    }
}

// Helper to write state to the file
function writeState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        logger.error('Failed to save state to file:', error);
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
    let state = readState();
    const { isManualRefresh = false } = options;

    try {
        let highSecIncursion;
        const { mockOverride } = state;

        // Check for an active and valid mock override
        if (mockOverride && mockOverride.expires > Date.now()) {
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
                        systemData: { security_status: 0.8 }
                    };
                } else {
                    highSecIncursion = null; // Invalid constellation name in mock
                }
            }
        } else {
            // If override is expired or doesn't exist, clear it and proceed with ESI
            if (mockOverride) {
                logger.info('Mock override has expired. Deleting it and resuming ESI updates.');
                delete state.mockOverride;
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
                    return { ...incursion, systemData };
                } catch (e) {
                    logger.error(`Could not resolve system ID ${incursion.staging_solar_system_id}:`, e.message);
                    return { ...incursion, systemData: null };
                }
            }));

            highSecIncursion = enrichedIncursions.find(inc => inc.systemData && inc.systemData.security_status >= 0.5);
        }

        const currentState = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';
        if (currentState === state.lastIncursionState && !isManualRefresh && !mockOverride) {
            logger.info('No change in high-sec incursion state.');
            isUpdating = false;
            return;
        }

        logger.info('High-sec incursion state has changed or manual/mock update triggered. Updating...');

        const currentSimpleState = highSecIncursion ? highSecIncursion.state : 'none';
        const lastSimpleState = state.lastIncursionState ? state.lastIncursionState.split('-')[1] : 'none';

        // State change detection for timestamping
        if (currentSimpleState !== lastSimpleState) {
            const now = Math.floor(Date.now() / 1000);
            if (lastSimpleState === 'none' && currentSimpleState === 'established') {
                state.spawnTimestamp = now;
                state.mobilizingTimestamp = null;
                state.withdrawingTimestamp = null;
                state.endedTimestamp = null;
                state.lastIncursionStats = null;
            } else if (lastSimpleState === 'established' && currentSimpleState === 'mobilizing') {
                state.mobilizingTimestamp = now;
            } else if (lastSimpleState === 'mobilizing' && currentSimpleState === 'withdrawing') {
                state.withdrawingTimestamp = now;
            } else if (currentSimpleState === 'none' && lastSimpleState !== 'none') {
                state.endedTimestamp = now;
                const lastConstellationId = parseInt(state.lastIncursionState.split('-')[0], 10);
                const lastSpawnData = incursionSystems.find(c => c['ConstellationID'] === lastConstellationId);
                if (lastSpawnData) state.lastHqSystemId = lastSpawnData['Dock Up System'];

                if (state.spawnTimestamp) {
                    const establishedDur = (state.mobilizingTimestamp || state.endedTimestamp) - state.spawnTimestamp;
                    const establishedUsage = Math.round((establishedDur / (5 * 24 * 3600)) * 100);
                    state.lastIncursionStats = {
                        totalDuration: formatDuration(state.endedTimestamp - state.spawnTimestamp),
                        establishedDuration: formatDuration(establishedDur),
                        mobilizingDuration: formatDuration(state.mobilizingTimestamp && state.withdrawingTimestamp ? state.withdrawingTimestamp - state.mobilizingTimestamp : null),
                        withdrawingDuration: formatDuration(state.withdrawingTimestamp ? state.endedTimestamp - state.withdrawingTimestamp : null),
                        establishedUsagePercentage: `${establishedUsage}%`
                    };
                }
            }
        }
        state.lastIncursionState = currentState;


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

            let timelineString = 'Calculating...';
            if (state.spawnTimestamp) {
                const momSpawnTime = state.spawnTimestamp + (3 * 24 * 3600);
                timelineString = `Spawned: <t:${state.spawnTimestamp}:R>\nMothership: <t:${momSpawnTime}:R>`;
                if (state.mobilizingTimestamp) {
                    const despawnTime = state.mobilizingTimestamp + (3 * 24 * 3600);
                    timelineString += `\nDespawns by: <t:${despawnTime}:R>`;
                }
            }

            embed = new EmbedBuilder()
                .setColor(stateColors[highSecIncursion.state] || stateColors.none)
                .setTitle(`High-Sec Incursion: **${spawnData.Constellation}**`)
                .setDescription(`Spawning in the [**${spawnData.REGION}**](https://evemaps.dotlan.net/region/${encodeURIComponent(spawnData.REGION)}) region.`)
                .setThumbnail(`https://images.evetech.net/corporations/${highSecIncursion.faction_id}/logo?size=128`)
                .addFields(
                    { name: 'Suggested Dockup', value: `${spawnData.Dockup}`, inline: true },
                    { name: 'Current State', value: `${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}`, inline: true },
                    { name: 'Incursion Timeline', value: timelineString, inline: true },
                    { name: 'Headquarters', value: `[${spawnData['Headquarter System']}](https://evemaps.dotlan.net/system/${encodeURIComponent(hqSystemName)})`, inline: true },
                    { name: 'Vanguards', value: formatSystemLinks(spawnData['Vanguard Systems']), inline: true },
                    { name: 'Assaults', value: formatSystemLinks(spawnData['Assault Systems']), inline: true },
                    { name: 'Routes from Trade Hubs', value: tradeHubJumpsString, inline: true },
                )
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' })
                .setTimestamp();

            if (lastHqRouteString) {
                embed.addFields({ name: 'Route from Last HQ', value: lastHqRouteString, inline: true });
            }
        } else {
            embed = new EmbedBuilder()
                .setColor(stateColors.none)
                .setTitle('No High-Sec Incursion Active')
                .setDescription('The High-Security incursion is not currently active. Fly safe!')
                .setImage('https://i.imgur.com/k6uS2Gk.png')
                .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' })
                .setTimestamp();

            if (state.endedTimestamp) {
                const windowOpen = state.endedTimestamp + (12 * 3600);
                const windowClose = windowOpen + (24 * 3600);
                embed.addFields({ name: 'Next Spawn Window', value: `Opens: <t:${windowOpen}:R>\nCloses: <t:${windowClose}:R>` });
            }
            if (state.lastIncursionStats) {
                const statsString = `**Total Duration**: ${state.lastIncursionStats.totalDuration}\n`
                    + `**Established**: ${state.lastIncursionStats.establishedDuration} (${state.lastIncursionStats.establishedUsagePercentage})\n`
                    + `**Mobilizing**: ${state.lastIncursionStats.mobilizingDuration}\n`
                    + `**Withdrawing**: ${state.lastIncursionStats.withdrawingDuration}`;
                embed.addFields({ name: 'Last Incursion Report', value: statsString });
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

        writeState(state);

    } catch (error) {
        logger.error('An unexpected error occurred during incursion update:', error);
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };

