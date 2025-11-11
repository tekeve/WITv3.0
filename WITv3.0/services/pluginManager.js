const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { getLogger } = require('@services/logger');

const logger = getLogger('PluginManager');

class PluginManager {
    constructor(client) {
        this.client = client;
        this.plugins = new Map();
        this.pluginsDir = path.join(__dirname, '..', 'Plugins');
        this.commandCollection = new Collection();
        this.commandData = [];
    }

    /**
     * Loads all plugins listed in plugins.json.
     * @param {object} sharedServices - An object containing shared services like db, webApp, etc.
     */
    loadPlugins(sharedServices) {
        let pluginConfig;
        try {
            const configPath = path.join(this.pluginsDir, 'plugins.json');
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            pluginConfig = JSON.parse(rawConfig);
            if (!Array.isArray(pluginConfig)) {
                throw new Error('plugins.json must contain an array of plugin names.');
            }
        } catch (error) {
            logger.error('Failed to load plugins.json. No plugins will be loaded.', { error: error.message });
            return;
        }

        logger.info(`Found ${pluginConfig.length} plugins to load.`);

        for (const pluginName of pluginConfig) {
            try {
                const pluginPath = path.join(this.pluginsDir, pluginName);
                delete require.cache[require.resolve(pluginPath)];
                const PluginClass = require(pluginPath);

                if (typeof PluginClass !== 'function') {
                    throw new Error('Plugin must export a class or constructor function.');
                }

                const pluginInstance = new PluginClass(this.client, sharedServices);

                if (typeof pluginInstance.load !== 'function') {
                    throw new Error('Plugin must have a "load()" method.');
                }

                // Pass shared services and load the plugin
                pluginInstance.load();

                this.plugins.set(pluginInstance.name, pluginInstance);
                logger.info(`Successfully loaded plugin: ${pluginInstance.name} (v${pluginInstance.version})`);

                // Register commands
                if (pluginInstance.commands && Array.isArray(pluginInstance.commands)) {
                    this.registerCommands(pluginInstance);
                }

                // Register event listeners
                if (pluginInstance.eventListeners && Array.isArray(pluginInstance.eventListeners)) {
                    this.registerEventListeners(pluginInstance);
                }

                // Register web routes
                if (sharedServices.webApp && typeof pluginInstance.registerWebRoutes === 'function') {
                    this.registerWebRoutes(pluginInstance, sharedServices.webApp);
                }

            } catch (error) {
                logger.error(`Failed to load plugin: ${pluginName}`, { error: error.message, stack: error.stack });
            }
        }

        // Store the final command collection on the client for the interaction handler
        this.client.commands = this.commandCollection;
        this.client.commandData = this.commandData; 
    }

    /**
     * Registers slash commands from a plugin.
     * @param {object} plugin - The plugin instance.
     */
    registerCommands(plugin) {
        for (const command of plugin.commands) {
            if (command.data && typeof command.execute === 'function') {
                this.commandCollection.set(command.data.name, command);
                this.commandData.push(command.data.toJSON());
                logger.debug(`Registered command "${command.data.name}" from plugin "${plugin.name}"`);
            } else {
                logger.warn(`Skipping malformed command from plugin "${plugin.name}"`, { command });
            }
        }
    }

    /**
     * Registers Discord client event listeners from a plugin.
     * @param {object} plugin - The plugin instance.
     */
    registerEventListeners(plugin) {
        for (const listener of plugin.eventListeners) {
            const { event, once, execute } = listener;
            if (event && typeof execute === 'function') {
                const wrappedExecute = (...args) => {
                    try {
                        execute(...args);
                    } catch (error) {
                        logger.error(`Error in event listener "${event}" from plugin "${plugin.name}"`, { error: error.message, stack: error.stack });
                    }
                };

                if (once) {
                    this.client.once(event, wrappedExecute);
                } else {
                    this.client.on(event, wrappedExecute);
                }
                logger.debug(`Registered event listener "${event}" from plugin "${plugin.name}"`);
            } else {
                logger.warn(`Skipping malformed event listener from plugin "${plugin.name}"`, { listener });
            }
        }
    }

    /**
     * Registers web routes from a plugin.
     * @param {object} plugin - The plugin instance.
     * @param {object} webApp - The Express app instance.
     */
    registerWebRoutes(plugin, webApp) {
        try {
            plugin.registerWebRoutes(webApp);
            logger.debug(`Registered web routes for plugin "${plugin.name}"`);
        } catch (error) {
            logger.error(`Failed to register web routes for plugin "${plugin.name}"`, { error: error.message, stack: error.stack });
        }
    }
}

module.exports = PluginManager;