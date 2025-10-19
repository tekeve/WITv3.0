const { EmbedBuilder } = require('discord.js');
const esiService = require('@helpers/esiService');
const logger = require('@helpers/logger');
const incursionManager = require('@helpers/incursionManager');
const { createProgressBar } = require('@helpers/progressBar'); // Import the progress bar helper

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
 * @param {object} state - The current stored state from the database, now including routeData.
 * @param {object} config - The bot's configuration object.
 * @param {boolean} isUsingMock - Whether mock data is being used.
 * @param {object} mockOverride - The mock data object.
 * @returns {Promise<EmbedBuilder>} A promise that resolves to the configured embed.
 */
async function buildActiveIncursionEmbed(highSecIncursion, state, config, isUsingMock, mockOverride) {
    const incursionSystems = incursionManager.get();
    const spawnData = incursionSystems.find(c => c.Constellation_id === highSecIncursion.constellation_id);
    if (!spawnData) throw new Error(`No matching spawn data for Constellation ID: ${highSecIncursion.constellation_id}`);

    const hqSystemFullName = spawnData.headquarters_system;
    const hqSystemName = hqSystemFullName.split(' (')[0];

    // Use pre-calculated route data from the state object.
    const tradeHubJumpsString = state.routeData?.tradeHubRoutes || 'Calculating...';
    const routeFromLastHqString = state.routeData?.lastHqRoute;

    const formatSystemLinks = (systemString) => !systemString ? 'None' : systemString.split(',').map(name => `[${name.trim()}](https://evemaps.dotlan.net/system/${encodeURIComponent(name.trim())})`).join(', ');

    const timelineParts = [];
    const spawnTimestamp = isUsingMock && mockOverride.spawnTimestamp ? mockOverride.spawnTimestamp : state.spawnTimestamp;
    const mobilizingTimestamp = isUsingMock && mockOverride.mobilizingTimestamp ? mockOverride.mobilizingTimestamp : state.mobilizingTimestamp;
    const withdrawingTimestamp = isUsingMock && mockOverride.withdrawingTimestamp ? mockOverride.withdrawingTimestamp : state.withdrawingTimestamp;

    if (spawnTimestamp) {
        timelineParts.push(`Spawned: <t:${spawnTimestamp}:f> (<t:${spawnTimestamp}:R>)`);
        const kundiSpawn = spawnTimestamp + (3 * 24 * 3600);
        timelineParts.push(`Kundi Spawn: <t:${kundiSpawn}:f> (<t:${kundiSpawn}:R>)`);
    }
    if (mobilizingTimestamp) {
        timelineParts.push(`Mobilizing: <t:${mobilizingTimestamp}:f> (<t:${mobilizingTimestamp}:R>)`);
        const despawnTime = mobilizingTimestamp + (3 * 24 * 3600);
        timelineParts.push(`Despawns by: <t:${despawnTime}:f> (<t:${despawnTime}:R>)`);
    }
    if (withdrawingTimestamp) {
        timelineParts.push(`Withdrawing: <t:${withdrawingTimestamp}:f> (<t:${withdrawingTimestamp}:R>)`);
    }
    const timelineString = timelineParts.length > 0 ? timelineParts.join('\n') : 'Calculating...';

    const currentStateString = highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1);

    const embed = new EmbedBuilder()
        .setColor(stateColors[highSecIncursion.state] || stateColors.none)
        .setTitle(`High-Sec Incursion: **${spawnData.Constellation}** (${currentStateString})`)
        .setDescription(`Spawning in the [**${spawnData.region}**](https://evemaps.dotlan.net/region/${encodeURIComponent(spawnData.region)}) region.`)
        .setThumbnail(spawnData.region_faction ? `https://images.evetech.net/corporations/${spawnData.region_faction}/logo?size=128` : null);

    const fields = [
        { name: 'Suggested Dockup', value: `${spawnData.dockup}`, inline: false },
        { name: 'Incursion Timeline', value: timelineString, inline: false },
        { name: 'Headquarters', value: `[${hqSystemFullName}](https://evemaps.dotlan.net/system/${encodeURIComponent(hqSystemName)})`, inline: true },
        { name: 'Assaults', value: formatSystemLinks(spawnData.assault_systems), inline: true },
        { name: 'Vanguards', value: formatSystemLinks(spawnData.vanguard_systems), inline: true },
        { name: 'Routes from Trade Hubs', value: tradeHubJumpsString, inline: true }
    ];

    if (routeFromLastHqString) {
        fields.push({ name: 'Route from Last HQ', value: routeFromLastHqString, inline: true });
    }

    embed.addFields(fields);

    // The value passed is the direct influence, which determines the bar's fullness (Sansha control).
    // The text is inverted from that value to show pilot progress towards completing the incursion.
    const influencePercentage = highSecIncursion.influence * 100;
    embed.addFields({ name: 'Sansha Control', value: createProgressBar(influencePercentage, 100, 30, true) });

    embed.setFooter({ text: 'WIT v3.0 Incursion Tracker | Data from ESI' }).setTimestamp();

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
        embed.addFields({ name: 'Next Spawn Window', value: `Opens: <t:${windowOpen}:F> (<t:${windowOpen}:R>)\nCloses: <t:${windowClose}:F> (<t:${windowClose}:R>)` });
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
        /**
         * if (stats.mobilizingPhase) {
         * statsFields.push(`**Mobilizing Phase**: ${stats.mobilizingPhase}`);
         * }
         */
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


