/**
 * Manages dynamic configuration from the database, overriding .env variables.
 */
class ConfigManager {
    /**
     * @param {object} plugin - The core plugin instance.
     */
    constructor(plugin) {
        this.db = plugin.db;
        this.logger = plugin.logger;
        this.config = plugin.config; // .env config
        this.cache = new Map();
        this.lastFetched = 0;
    }

    /**
     * Loads or re-loads the dynamic config from the database.
     */
    async loadConfig() {
        this.logger.info('[ConfigManager] Loading dynamic config from database...');
        try {
            // --- This is example logic ---
            // --- Replace with your actual logic from helpers/configManager.js ---
            const [rows] = await this.db.query('SELECT * FROM bot_config');

            this.cache.clear();
            for (const row of rows) {
                // Assuming config is stored as key/value pairs
                // You may need to JSON.parse(row.value) if it's an array/object
                this.cache.set(row.config_key, row.config_value);
            }
            this.lastFetched = Date.now();
            this.logger.info(`[ConfigManager] Loaded ${this.cache.size} config items.`);

        } catch (error) {
            this.logger.error('[ConfigManager] Failed to load dynamic config:', { error: error.stack || error });
        }
    }

    /**
     * Gets the full config, merging .env with the database cache.
     * @param {boolean} forceRefresh - If true, bypass cache and reload from DB.
     * @returns {Promise<object>} The merged config object.
     */
    async get(forceRefresh = false) {
        const cacheExpiry = 5 * 60 * 1000; // 5 minutes
        if (forceRefresh || Date.now() - this.lastFetched > cacheExpiry) {
            await this.loadConfig();
        }

        // Merge .env (as base) with database cache (as override)
        const mergedConfig = { ...this.config }; // Start with .env
        for (const [key, value] of this.cache.entries()) {
            // This is a simple override. You may need to merge arrays/objects
            mergedConfig[key] = value;
        }

        return mergedConfig;
    }
}

module.exports = ConfigManager;