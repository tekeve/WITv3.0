require('dotenv').config();
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

// Color map for incursion states
const stateColors = {
    established: 0x3BA55D, // Green
    mobilizing: 0xFFEA00,  // Yellow
    withdrawing: 0xFFA500, // Orange
    none: 0xED4245         // Red
};


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
            logger.info('No change in high-sec incursion state.');
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
            const hqSystemName = spawnData['Headquarter System'].split(' (')[0];

            let lastHqRouteString = '';
            if (lastHqSystemId && lastHqSystemId !== currentHqId) {
                const lastHqNameData = incursionSystems.find(sys => sys['Dock Up System'] === lastHqSystemId);
                const lastHqName = lastHqNameData ? lastHqNameData['Headquarter System'].split(' ')[0] : 'Last HQ';
                try {
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:shortest`;
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=secure`;
                    const shortestEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=shortest`;
                    const [secureResponse, shortestResponse] = await Promise.all([
                        axios.get(secureEsiUrl, { timeout: 5000 }),
                        axios.get(shortestEsiUrl, { timeout: 5000 })
                    ]);
                    const secureJumps = secureResponse.data.length - 1;
                    const shortestJumps = shortestResponse.data.length - 1;
                    lastHqRouteString = `From **${lastHqName}**: [${secureJumps}j (secure)](${secureGatecheckUrl}) / [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                } catch (e) {
                    logger.error('Failed to calculate route from last HQ:', e.message);
                    lastHqRouteString = `From **${lastHqName}**: N/A`;
                }
            }
            lastHqSystemId = currentHqId;

            const jumpPromises = Object.entries(config.tradeHubs).map(async ([name, id]) => {
                try {
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${hqSystemName}:${name}:secure`;
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${currentHqId}/${id}/?flag=secure`;
                    const response = await axios.get(secureEsiUrl, { timeout: 5000 });
                    const jumpCount = response.data.length - 1;
                    return { name: name, jumps: `[${jumpCount} Jumps](${secureGatecheckUrl})` };
                } catch (e) {
                    return { name: name, jumps: 'N/A' };
                }
            });
            const jumpCounts = await Promise.all(jumpPromises);

            const formatSystemLinks = (systemString) => {
                if (!systemString || systemString.trim() === '') return 'None';
                return systemString.split(',')
                    .map(name => name.trim())
                    .map(name => `[${name}](https://evemaps.dotlan.net/system/${encodeURIComponent(name)})`)
                    .join(', ');
            };

            const embedColor = stateColors[highSecIncursion.state] || stateColors.none;

            embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`High-Sec Incursion: ${factionMap[highSecIncursion.faction_id] || 'Unknown Faction'}`)
                .setDescription(`Sansha's Nation is targeting the **${spawnData.Constellation}** constellation in the **${spawnData.REGION}** region.`)
                .setThumbnail(`https://images.evetech.net/corporations/${highSecIncursion.faction_id === 500019 ? 1000179 : 1000182}/logo?size=128`)
                .addFields(
                    { name: 'Headquarters System', value: `[${spawnData['Headquarter System']}](https://evemaps.dotlan.net/system/${encodeURIComponent(hqSystemName)})`, inline: true },
                    { name: 'Current State', value: `\`${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}\``, inline: true },
                    { name: 'Island Constellation?', value: spawnData.ISLAND === 'ISLAND' ? '`Yes`' : '`No`', inline: true },
                    { name: 'Vanguard Systems', value: formatSystemLinks(spawnData['Vanguard Systems']), inline: false },
                    { name: 'Assault Systems', value: formatSystemLinks(spawnData['Assault Systems']), inline: false },
                    { name: 'Suggested Dockup', value: `\`${spawnData.Dockup}\``, inline: false },
                    { name: `Travel from ${jumpCounts[0].name}`, value: jumpCounts[0].jumps, inline: true },
                    { name: `Travel from ${jumpCounts[1].name}`, value: jumpCounts[1].jumps, inline: true },
                    { name: `Travel from ${jumpCounts[2].name}`, value: jumpCounts[2].jumps, inline: true },
                )
                .setFooter({ text: 'WTM-WIT Incursion Tracker | Data from ESI' })
                .setTimestamp();

            if (lastHqRouteString) {
                embed.addFields({ name: 'Travel from Last HQ', value: lastHqRouteString, inline: false });
            }

        } else {
            embed = new EmbedBuilder()
                .setColor(stateColors.none)
                .setTitle('No High-Sec Incursion Active')
                .setDescription('The High-Security incursion is not currently active. Fly safe!')
                .setFooter({ text: 'WTM-WIT Incursion Tracker | Data from ESI' })
                .setTimestamp();
        }

        saveState();

        const channel = await client.channels.fetch(process.env.INCURSION_CHANNEL_ID);
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
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                logger.warn('ESI request timed out. Retrying on the next cycle.');
            } else if (error.response) {
                logger.warn(`ESI returned a non-2xx status: ${error.response.status}. Retrying on the next cycle.`);
            } else {
                logger.warn('An error occurred while contacting ESI. Retrying on the next cycle.');
            }
        } else {
            logger.error('An unexpected error occurred during incursion update:', error);
        }
    } finally {
        isUpdating = false;
        logger.info('Update check finished.');
    }
}

module.exports = { updateIncursions };

