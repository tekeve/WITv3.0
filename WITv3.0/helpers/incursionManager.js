const db = require('@helpers/database');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');

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
 * @returns {Promise<string>} A summary of the changes made.
 */
async function verifyAndSyncIncursionSystems() {
    if (!incursionSystems) {
        await loadIncursionSystems();
    }

    let changesSummary = '';
    let updatedCount = 0;

    for (const localSystem of incursionSystems) {
        try {
            const changes = [];
            const updates = {};

            // 1. Fetch Constellation data
            const constellationData = await esiService.get({ endpoint: `/universe/constellations/${localSystem.Constellation_id}/`, caller: __filename });
            const esiConstellation = constellationData.data;

            if (localSystem.Constellation !== esiConstellation.name) {
                updates.Constellation = esiConstellation.name;
                changes.push(`Constellation Name: \`${localSystem.Constellation}\` -> \`${esiConstellation.name}\``);
            }
            if (String(localSystem.region_id) !== String(esiConstellation.region_id)) {
                updates.region_id = esiConstellation.region_id;
                changes.push(`Region ID: \`${localSystem.region_id}\` -> \`${esiConstellation.region_id}\``);
            }

            // 2. Fetch Region data
            const regionData = await esiService.get({ endpoint: `/universe/regions/${esiConstellation.region_id}/`, caller: __filename });
            const esiRegion = regionData.data;

            // --- MODIFICATION START ---
            // The 'faction_id' field is only present for sovereign null-sec regions.
            // High-sec regions do not have this, so we will no longer sync this field
            // to preserve the manually entered NPC faction data.
            /*
            const esiFactionId = esiRegion.faction_id ? String(esiRegion.faction_id) : null;
            */
            // --- MODIFICATION END ---


            if (localSystem.region !== esiRegion.name) {
                updates.region = esiRegion.name;
                changes.push(`Region Name: \`${localSystem.region}\` -> \`${esiRegion.name}\``);
            }

            // --- MODIFICATION START ---
            /*
            if (String(localSystem.region_faction) !== String(esiFactionId)) { // Cast to string for comparison
                updates.region_faction = esiFactionId;
                changes.push(`Faction ID: \`${localSystem.region_faction}\` -> \`${esiFactionId}\``);
            }
            */
            // --- MODIFICATION END ---

            // 3. Fetch HQ System data
            if (localSystem.dock_up_system_id) { // Some might not have it
                const hqSystemData = await esiService.get({ endpoint: `/universe/systems/${localSystem.dock_up_system_id}/`, caller: __filename });
                const esiHqSystem = hqSystemData.data;

                // ESI's system name does not include security status, so we format our local one to match for comparison.
                const localHqSystemName = localSystem.headquarters_system.split(' (')[0];

                // --- MODIFICATION START ---
                // This check has been disabled to prevent overwriting manually set HQ system names.
                // The 'dockup' column is not modified by this script and is also preserved.
                /*
                if (localHqSystemName !== esiHqSystem.name) {
                    const newHqName = `${esiHqSystem.name} (${esiHqSystem.security_status.toFixed(1)})`;
                    updates.headquarters_system = newHqName;
                    changes.push(`HQ System Name: \`${localSystem.headquarters_system}\` -> \`${newHqName}\``);
                }
                */
                // --- MODIFICATION END ---
            }

            // --- NEW FEATURE START ---
            // 4. Verify dock_up_system_id based on dockup name
            if (localSystem.dockup) {
                // Extract the system name from the full station name. Assumes format "SystemName Station Details".
                const dockupSystemName = localSystem.dockup.split(' ')[0];
                if (dockupSystemName) {
                    try {
                        const searchResult = await esiService.get({
                            endpoint: `/latest/search/`,
                            params: {
                                categories: 'solar_system',
                                search: dockupSystemName,
                                strict: true // Use strict search to avoid ambiguity
                            },
                            caller: __filename
                        });

                        const esiSystemId = searchResult.data?.solar_system?.[0];

                        // Compare and update if a valid ID was found and it's different
                        if (esiSystemId && String(localSystem.dock_up_system_id) !== String(esiSystemId)) {
                            updates.dock_up_system_id = String(esiSystemId);
                            changes.push(`Dockup System ID: \`${localSystem.dock_up_system_id}\` -> \`${esiSystemId}\``);
                        }
                    } catch (searchError) {
                        logger.warn(`Could not verify dockup system ID for '${dockupSystemName}' via ESI search: ${searchError.message}`);
                    }
                }
            }
            // --- NEW FEATURE END ---


            // If there are changes, update the database
            if (Object.keys(updates).length > 0) {
                updatedCount++;
                const setClauses = Object.keys(updates).map(key => `${key} = ?`).join(', ');
                const values = [...Object.values(updates), localSystem.Constellation_id];
                const sql = `UPDATE incursion_systems SET ${setClauses} WHERE Constellation_id = ?`;
                await db.query(sql, values);
                changesSummary += `**${localSystem.Constellation}:**\n- ${changes.join('\n- ')}\n\n`;
            }
        } catch (error) {
            logger.error(`Failed to sync data for constellation ID ${localSystem.Constellation_id}:`, error);
            changesSummary += `**${localSystem.Constellation}:**\n- ❌ Error syncing this entry. Please check the logs.\n\n`;
        }
    }

    if (updatedCount > 0) {
        await loadIncursionSystems(); // Reload cache after updates
        return `**Data Sync Complete**\nUpdated ${updatedCount} constellation(s) with the following changes:\n\n${changesSummary}`;
    } else {
        return '✅ All incursion system data is already up to date with ESI.';
    }
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

