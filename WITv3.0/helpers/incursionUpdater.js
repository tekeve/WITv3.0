const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const logger = require('@helpers/logger');

const STATE_FILE = path.join(__dirname, '..', 'state.json');

let stateData;
try {
    stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (error) {
    logger.info('State file not found or invalid, creating a fresh state.');
    stateData = {};
}

let {
    lastIncursionState = '',
    incursionMessageId = null,
    lastHqSystemId = null
} = stateData;

let isUpdating = false;
const factionMap = { 500019: 'Sansha\'s Nation', 500020: 'Triglavian Collective' };
const incursionSystems = require('./incursionsystem.json');

function saveState() {
    const state = { lastIncursionState, incursionMessageId, lastHqSystemId };
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        logger.error('Failed to save state to file:', error);
    }
}

async function updateIncursions(client, isManualRefresh = false) {
    if (isUpdating) { return; }
    isUpdating = true;
    try {
        logger.info('Checking for incursion updates...');
        const response = await axios.get('https://esi.evetech.net/latest/incursions/', { timeout: 5000 });
        const allIncursions = response.data;

        const getSystemData = async (systemId) => {
            try {
                const sysResponse = await axios.get(`https://esi.evetech.net/latest/universe/systems/${systemId}/`, { timeout: 5000 });
                return sysResponse.data;
            } catch (e) {
                logger.error(`Could not resolve system ID ${systemId}:`, e.message);
                return null;
            }
        };

        const enrichedIncursions = await Promise.all(allIncursions.map(async (incursion) => {
            const systemData = await getSystemData(incursion.staging_solar_system_id);
            return { ...incursion, systemData };
        }));

        const highSecIncursion = enrichedIncursions.find(inc => inc.systemData && inc.systemData.security_status >= 0.5);
        const currentState = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';

        if (currentState === lastIncursionState && !isManualRefresh) {
            logger.warn('No change in high-sec incursion state.');
            return;
        }

        logger.info('High-sec incursion state has changed or manual refresh triggered. Updating...');
        lastIncursionState = currentState;

        let embed;
        if (highSecIncursion) {
            const spawnData = incursionSystems.find(constellation => constellation['ConstellationID'] === highSecIncursion.constellation_id);

            if (!spawnData) {
                logger.info(`No matching spawn data found for Constellation ID: ${highSecIncursion.constellation_id}`);
                return;
            }

            const currentHqId = spawnData['Dock Up System'];
            const currentHqName = spawnData['Headquarter System'].split(' ')[0];
            let lastHqRouteString = '';

            if (lastHqSystemId && lastHqSystemId !== currentHqId) {
                const lastHqNameData = incursionSystems.find(sys => sys['Dock Up System'] === lastHqSystemId);
                const lastHqName = lastHqNameData ? lastHqNameData['Headquarter System'].split(' ')[0] : 'Last HQ';
                try {
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${currentHqName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${currentHqName}:shortest`;
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=secure`;
                    const shortestEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=shortest`;
                    const [secureResponse, shortestResponse] = await Promise.all([
                        axios.get(secureEsiUrl, { timeout: 5000 }),
                        axios.get(shortestEsiUrl, { timeout: 5000 })
                    ]);
                    const secureJumps = secureResponse.data.length - 1;
                    const shortestJumps = shortestResponse.data.length - 1;
                    if (secureJumps === shortestJumps) {
                        lastHqRouteString = `**From ${lastHqName}**: [${shortestJumps} jumps](${shortestGatecheckUrl})`;
                    } else {
                        lastHqRouteString = `**From ${lastHqName}**: [${secureJumps}j (secure)](${secureGatecheckUrl}), [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                    }
                } catch (e) {
                    logger.error('Failed to calculate route from last HQ:', e.message);
                    lastHqRouteString = `**From ${lastHqName}**: N/A`;
                }
            }
            lastHqSystemId = currentHqId;

            const jumpPromises = Object.entries(config.tradeHubs).map(async ([name, id]) => {
                const originId = currentHqId;
                const destinationId = id;
                const originName = currentHqName;
                const destinationName = name;
                try {
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${originName}:${destinationName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${originName}:${destinationName}:shortest`;
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${originId}/${destinationId}/?flag=secure`;
                    const shortestEsiUrl = `https://esi.evetech.net/v1/route/${originId}/${destinationId}/?flag=shortest`;
                    const [secureResponse, shortestResponse] = await Promise.all([
                        axios.get(secureEsiUrl, { timeout: 5000 }),
                        axios.get(shortestEsiUrl, { timeout: 5000 })
                    ]);
                    const secureJumps = secureResponse.data.length - 1;
                    const shortestJumps = shortestResponse.data.length - 1;
                    if (secureJumps === shortestJumps) {
                        return `**${name}**: [${shortestJumps} jumps](${shortestGatecheckUrl})`;
                    } else {
                        return `**${name}**: [${secureJumps}j (secure)](${secureGatecheckUrl}), [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                    }
                } catch (e) {
                    return `**${name}**: N/A`;
                }
            });
            const jumpCounts = await Promise.all(jumpPromises);

            embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle(`High-Sec Incursion Active: ${factionMap[highSecIncursion.faction_id] || 'Unknown Faction'}`)
                .setThumbnail(`https://images.evetech.net/corporations/${highSecIncursion.faction_id === 500019 ? 1000179 : 1000182}/logo?size=64`)
                .addFields(
                    { name: 'Region', value: spawnData.REGION, inline: true },
                    { name: 'Constellation', value: spawnData.Constellation, inline: true },
                    { name: 'Security', value: highSecIncursion.systemData.security_status.toFixed(1), inline: true },
                    { name: 'State', value: `\`${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}\``, inline: true },
                    { name: 'Headquarters', value: `[${spawnData['Headquarter System'].split(' ')[0]}](${`https://evemaps.dotlan.net/system/${spawnData['Headquarter System'].split(' ')[0]}`})`, inline: false },
                    { name: 'Vanguard Systems', value: spawnData['Vanguard Systems'] || 'None', inline: false },
                    { name: 'Assault Systems', value: spawnData['Assault Systems'] || 'None', inline: false },
                    { name: 'Suggested Dockup', value: spawnData.Dockup, inline: false },
                    ...(lastHqRouteString ? [{ name: 'Jumps from Last HQ', value: lastHqRouteString, inline: false }] : []),
                    { name: 'Jumps from HQ', value: jumpCounts.join('\n'), inline: false }
                ).setTimestamp();
        } else {
            embed = new EmbedBuilder().setColor(0x3BA55D).setTitle('No High-Sec Incursion Active').setDescription('The High-Security incursion is not currently active. Fly safe!').setTimestamp();
        }

        saveState();

        const channel = await client.channels.fetch(config.incursionChannelId);
        if (!channel) { return; }
        const messagePayload = { content: ' ', embeds: [embed] };
        if (incursionMessageId) {
            try {
                const message = await channel.messages.fetch(incursionMessageId);
                await message.edit(messagePayload);
            }
            catch (error) {
                logger.info('Previous message not found, posting a new one.');
                const newMessage = await channel.send(messagePayload);
                incursionMessageId = newMessage.id;
                saveState();
            }
        } else {
            const newMessage = await channel.send(messagePayload);
            incursionMessageId = newMessage.id;
            saveState();
        }
    } catch (error) {
        // <<< START: NEW ERROR HANDLING LOGIC >>>
        if (axios.isAxiosError(error)) {
            // This is a network-level error (timeout, DNS, etc.)
            if (error.code === 'ECONNABORTED') {
                logger.warn('ESI request timed out. Retrying on the next cycle.');
            } else if (error.response) {
                // The ESI server responded with an error status code (4xx, 5xx)
                logger.warn(`ESI returned a non-2xx status: ${error.response.status}. Retrying on the next cycle.`);
            } else {
                // A different network error occurred
                logger.warn('An error occurred while contacting ESI. Retrying on the next cycle.');
            }
        } else {
            // This is not an Axios error, so it's likely an issue with Discord or our own code.
            // We log the full error here for better debugging.
            logger.error('An unexpected error occurred during incursion update:', error);
        }
        // <<< END: NEW ERROR HANDLING LOGIC >>>
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };
