const { EmbedBuilder } = require('discord.js');
const esiService = require('@helpers/esiService');
const logger = require('@helpers/logger');
const incursionManager = require('@helpers/incursionManager');

// Color map for incursion states
const stateColors = {
    established: 0x3BA55D, // Green
    mobilizing: 0xFFEA00,  // Yellow
    withdrawing: 0xFFA500, // Orange
    none: 0xED4245         // Red
};

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

/**
 * Builds the embed for an active high-sec incursion.
 * @param {object} highSecIncursion - The incursion data from ESI.
 * @param {object} state - The current stored state from the database.
 * @param {object} config - The bot's configuration object.
 * @param {boolean} isUsingMock - Whether mock data is being used.
 * @param {object} mockOverride - The mock data object.
 * @returns {Promise<EmbedBuilder>} A promise that resolves to the configured embed.
 */
async function buildActiveIncursionEmbed(highSecIncursion, state, config, isUsingMock, mockOverride) {
    const incursionSystems = incursionManager.get();
    const spawnData = incursionSystems.find(c => c.Constellation_id === highSecIncursion.constellation_id);
    if (!spawnData) throw new Error(`No matching spawn data for Constellation ID: ${highSecIncursion.constellation_id}`);

    const currentHqId = spawnData.dock_up_system_id;
    const hqSystemFullName = spawnData.headquarters_system;
    const hqSystemName = hqSystemFullName.split(' (')[0];

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

    const embed = new EmbedBuilder()
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
        // FIX: Convert the dock_up_system_id from a string to a number for comparison.
        const lastHqNameData = incursionSystems.find(sys => Number(sys.dock_up_system_id) === state.lastHqSystemId);

        if (lastHqNameData) {
            const lastHqName = lastHqNameData.headquarters_system.split(' (')[0];
            const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:secure`;
            const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${hqSystemName}:shortest`;
            const secureEsiUrl = `/route/${state.lastHqSystemId}/${currentHqId}/?flag=secure`;
            const shortestEsiUrl = `/route/${state.lastHqSystemId}/${currentHqId}/?flag=shortest`;

            try {
                // Use Promise.allSettled to ensure that even if one route fails, the other can be processed.
                const results = await Promise.allSettled([
                    esiService.get(secureEsiUrl),
                    esiService.get(shortestEsiUrl)
                ]);

                const secureRes = results[0].status === 'fulfilled' ? results[0].value : null;
                const shortestRes = results[1].status === 'fulfilled' ? results[1].value : null;

                const secureJumps = secureRes ? secureRes.length - 1 : null;
                const shortestJumps = shortestRes ? shortestRes.length - 1 : null;

                if (secureJumps !== null && secureJumps === shortestJumps) {
                    // If both routes are the same, just show one.
                    routeString = `**${lastHqName}**: [${secureJumps}j (safest)](${secureGatecheckUrl})`;
                } else {
                    const parts = [];
                    if (secureJumps !== null) {
                        parts.push(`[${secureJumps}j (safest)](${secureGatecheckUrl})`);
                    }
                    if (shortestJumps !== null) {
                        parts.push(`[${shortestJumps}j (shortest)](${shortestGatecheckUrl})`);
                    }

                    if (parts.length > 0) {
                        routeString = `**${lastHqName}**: ${parts.join(' / ')}`;
                    } else {
                        routeString = `**${lastHqName}**: No Stargate Route`;
                    }
                }
            } catch (error) {
                // This will now only catch unexpected errors, not failed route lookups.
                logger.error(`Unexpected error in route calculation: ${error.message}`);
                routeString = `**${lastHqName}**: Error`;
            }
        }
        fields.push({ name: '\u200b', value: '\u200b', inline: true }); // Spacer
        fields.push({ name: 'Route from Last HQ', value: routeString, inline: true });
    }

    embed.addFields(fields)
        .setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' }).setTimestamp();

    return embed;
}

/**
 * Builds the embed for when there is no active high-sec incursion.
 * @param {object} state - The current stored state from the database.
 * @returns {EmbedBuilder} The configured embed.
 */
function buildNoIncursionEmbed(state) {
    const embed = new EmbedBuilder()
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
        const stats = state.lastIncursionStats;
        const statsFields = [];

        // Dynamically add fields only if they exist in the calculated stats object
        if (stats.totalDuration) {
            statsFields.push(`**Total Duration**: ${stats.totalDuration}`);
        }
        if (stats.establishedPhase) {
            statsFields.push(`**Established Phase**: ${stats.establishedPhase}`);
        }
        if (stats.mobilizingPhase) {
            statsFields.push(`**Mobilizing Phase**: ${stats.mobilizingPhase}`);
        }
        if (stats.withdrawingPeriodUsed) {
            statsFields.push(`**Withdrawing Period Used**: ${stats.withdrawingPeriodUsed}`);
        }

        if (statsFields.length > 0) {
            embed.addFields({ name: 'Last Incursion Stats', value: statsFields.join('\n') });
        }
    }
    return embed;
}

module.exports = { buildActiveIncursionEmbed, buildNoIncursionEmbed, formatDuration };

