const db = require('@helpers/database');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');
const authManager = require('@helpers/authManager');

let incursionSystems = null;

/**
 * Fetches the latest incursion system data from the database and updates the in-memory cache.
 */
async function loadIncursionSystems() {
    try {
        logger.info('Loading incursion systems data from the database...');
        const rows = await db.query('SELECT * FROM incursion_systems');
        incursionSystems = rows;
        logger.success(`Successfully loaded ${rows.length} incursion systems.`);
    } catch (error) {
        logger.error('Failed to load incursion systems from database:', error);
        incursionSystems = []; // Ensure it's an empty array on failure
    }
}

/**
 * Verifies and syncs the local incursion_systems table with ESI data.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object from the command execution.
 * @returns {Promise<{updated: Array, failed: Array, unchanged: number}>} A summary report of the changes made.
 */
async function verifyAndSyncIncursionSystems(interaction) {
    if (!incursionSystems) {
        await loadIncursionSystems();
    }

    // Get auth data for the user running the command to make authenticated ESI calls.
    const authData = await authManager.getUserAuthData(interaction.user.id);
    if (!authData) {
        const reason = 'Executing admin is not authenticated with ESI. Please use `/auth login`.';
        logger.error(`DataSync failed: ${reason}`);
        return {
            updated: [],
            failed: incursionSystems.map(s => ({ name: s.Constellation, reason: reason })),
            unchanged: 0
        };
    }
    const accessToken = await authManager.getAccessToken(interaction.user.id);
    if (!accessToken) {
        const reason = 'Could not get a valid ESI token for the executing admin. Please try `/auth login` again.';
        logger.error(`DataSync failed: ${reason}`);
        return {
            updated: [],
            failed: incursionSystems.map(s => ({ name: s.Constellation, reason: reason })),
            unchanged: 0
        };
    }
    const headers = { 'Authorization': `Bearer ${accessToken}` };


    const report = {
        updated: [],
        failed: [],
        unchanged: 0
    };

    for (const localSystem of incursionSystems) {
        let hasChanged = false;
        try {
            const changes = [];
            const updates = {};

            // 1. Fetch Constellation data (public endpoint, no auth needed)
            const constellationData = await esiService.get({ endpoint: `universe/constellations/${localSystem.Constellation_id}/`, caller: __filename });
            const esiConstellation = constellationData.data;

            if (localSystem.Constellation !== esiConstellation.name) {
                updates.Constellation = esiConstellation.name;
                changes.push(`Constellation Name: \`${localSystem.Constellation}\` -> \`${esiConstellation.name}\``);
            }
            if (String(localSystem.region_id) !== String(esiConstellation.region_id)) {
                updates.region_id = esiConstellation.region_id;
                changes.push(`Region ID: \`${localSystem.region_id}\` -> \`${esiConstellation.region_id}\``);
            }

            // 2. Fetch Region data (public endpoint, no auth needed)
            const regionData = await esiService.get({ endpoint: `universe/regions/${esiConstellation.region_id}/`, caller: __filename });
            const esiRegion = regionData.data;

            if (localSystem.region !== esiRegion.name) {
                updates.region = esiRegion.name;
                changes.push(`Region Name: \`${localSystem.region}\` -> \`${esiRegion.name}\``);
            }

            // 3. Verify dock_up_system_id based on dockup name using authenticated search
            if (localSystem.dockup) {
                const dockupSystemName = localSystem.dockup.split(' ')[0];
                if (dockupSystemName) {
                    try {
                        // Use the authenticated character search endpoint.
                        const searchResult = await esiService.get({
                            endpoint: `characters/${authData.character_id}/search/`,
                            params: {
                                categories: 'solar_system',
                                search: dockupSystemName,
                                strict: true
                            },
                            headers: headers,
                            caller: __filename
                        });

                        const esiSystemId = searchResult.data?.solar_system?.[0];

                        if (esiSystemId && String(localSystem.dock_up_system_id) !== String(esiSystemId)) {
                            updates.dock_up_system_id = String(esiSystemId);
                            changes.push(`Dockup System ID: \`${localSystem.dock_up_system_id}\` -> \`${esiSystemId}\``);
                        }
                    } catch (searchError) {
                        logger.warn(`Could not verify dockup system ID for '${dockupSystemName}' via ESI search: ${searchError.message}`);
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                hasChanged = true;
                const setClauses = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
                const values = [...Object.values(updates), localSystem.Constellation_id];
                const sql = `UPDATE incursion_systems SET ${setClauses} WHERE Constellation_id = ?`;
                await db.query(sql, values);
                report.updated.push({
                    name: localSystem.Constellation,
                    changes: `- ${changes.join('\n- ')}`
                });
            }

            if (!hasChanged) {
                report.unchanged++;
            }
        } catch (error) {
            logger.error(`Failed to sync data for constellation ID ${localSystem.Constellation_id}:`, error.message);
            report.failed.push({
                name: localSystem.Constellation || `ID ${localSystem.Constellation_id}`,
                reason: error.message
            });
        }
    }

    if (report.updated.length > 0) {
        await loadIncursionSystems(); // Reload cache after updates
    }

    return report;
}

/**
 * Returns the cached incursion systems array.
 * @returns {Array} The array of incursion system objects.
 */
function get() {
    return incursionSystems;
}

module.exports = {
    loadIncursionSystems,
    verifyAndSyncIncursionSystems,
    get
};

