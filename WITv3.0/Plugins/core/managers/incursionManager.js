// --- LIKELY DEPENDENCIES ---
// Add any other dependencies your old file needed
const { EmbedBuilder } = require('discord.js');
const { createIncursionEmbed } = require('../../../embeds/incursionEmbed');

/**
 * Manages fetching and reporting EVE Online incursions.
 * This helper is refactored as a class to be used by the Core plugin.
 */
class IncursionManager {

    /**
     * @param {object} plugin - The core plugin instance.
     * @param {Client} plugin.client - The Discord.js Client.
     * @param {any} plugin.db - The database connection pool.
     * @param {winston.Logger} plugin.logger - The plugin's logger.
     * @param {object} plugin.config - The process.env config.
     */
    constructor(plugin) {
        // Unpack the shared services from the plugin
        this.client = plugin.client;
        this.db = plugin.db;
        this.logger = plugin.logger;
        this.config = plugin.config;
        this.esiService = plugin.esiService;
        // You can also initialize any internal state here
        this.lastIncursionState = null;
    }

    /**
     * Fetches the current incursion data from ESI.
     * This is the function that was causing the error.
     */
    async updateIncursions() {
        this.logger.info('Fetching incursion data...');
        try {

            // 1. Fetch data from ESI
            const incursionData = await this.esiService.request('/incursions/');

            // 2. Check if the state has changed
            if (JSON.stringify(incursionData) === JSON.stringify(this.lastIncursionState)) {
                this.logger.debug('Incursion state unchanged, skipping update.');
                return;
            }
            this.lastIncursionState = incursionData;

            // 3. Find the configured channel to post in
            const channelId = this.config.INCURSION_CHANNEL_ID;
            if (!channelId) {
                this.logger.warn('INCURSION_CHANNEL_ID not set, cannot post update.');
                return;
            }

            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                this.logger.error(`Cannot find incursion channel with ID: ${channelId}`);
                return;
            }

            // 4. Create the embed
            const embed = createIncursionEmbed(incursionData);

            // 5. Post the update
            await channel.send({ embeds: [embed] });
            this.logger.info('Posted incursion update to channel.');

            // --- End of example logic ---

        } catch (error) {
            this.logger.error('Failed to update incursions:', { error: error.stack || error });
        }
    }
    async loadIncursionSystems() {
        try {
            this.logger.info('Loading incursion systems data from the database...');
            const rows = await this.db.query('SELECT * FROM incursion_systems');
            incursionSystems = rows;
            this.logger.success(`Successfully loaded ${rows.length} incursion systems.`);
        } catch (error) {
            this.logger.error('Failed to load incursion systems from database:', error);
            incursionSystems = []; // Ensure it's an empty array on failure
        }
    }

    /**
     * Verifies and syncs the local incursion_systems table with ESI data.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object from the command execution.
     * @returns {Promise<{updated: Array, failed: Array, unchanged: number}>} A summary report of the changes made.
     */
    async verifyAndSyncIncursionSystems(interaction) {
        if (!incursionSystems) {
            await loadIncursionSystems();
        }

        // Get auth data for the user running the command to make authenticated ESI calls.
        const authData = await this.authManager.getUserAuthData(interaction.user.id);
        if (!authData) {
            const reason = 'Executing admin is not authenticated with ESI. Please use `/auth login`.';
            this.logger.error(`DataSync failed: ${reason}`);
            return {
                updated: [],
                failed: incursionSystems.map(s => ({ name: s.Constellation, reason: reason })),
                unchanged: 0
            };
        }
        const accessToken = await this.authManager.getAccessToken(interaction.user.id);
        if (!accessToken) {
            const reason = 'Could not get a valid ESI token for the executing admin. Please try `/auth login` again.';
            this.logger.error(`DataSync failed: ${reason}`);
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
                const constellationData = await this.esiService.get({ endpoint: `universe/constellations/${localSystem.Constellation_id}/`, caller: __filename });
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
                const regionData = await this.esiService.get({ endpoint: `universe/regions/${esiConstellation.region_id}/`, caller: __filename });
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
                            const searchResult = await this.esiService.get({
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
                            this.logger.warn(`Could not verify dockup system ID for '${dockupSystemName}' via ESI search: ${searchError.message}`);
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    hasChanged = true;
                    const setClauses = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
                    const values = [...Object.values(updates), localSystem.Constellation_id];
                    const sql = `UPDATE incursion_systems SET ${setClauses} WHERE Constellation_id = ?`;
                    await this.db.query(sql, values);
                    report.updated.push({
                        name: localSystem.Constellation,
                        changes: `- ${changes.join('\n- ')}`
                    });
                }

                if (!hasChanged) {
                    report.unchanged++;
                }
            } catch (error) {
                this.logger.error(`Failed to sync data for constellation ID ${localSystem.Constellation_id}:`, error.message);
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
    get() {
        return incursionSystems;
    }
}

// Export the class so the plugin can create an instance of it
module.exports = IncursionManager;