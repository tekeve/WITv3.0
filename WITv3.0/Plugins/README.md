WITv3.0 Plugin Architecture
This document explains how to create plugins for the WITv3.0 bot.
Plugin Structure
A plugin is a self-contained module that adds features to the bot. It consists of a single index.js file (or a directory with an index.js as its entry point) located in the Plugins/ directory.
Each plugin must be registered in plugins.json to be loaded.
Plugin Definition (index.js)
A plugin must export a class that defines its behavior. This class will be instantiated by the PluginManager during startup.
The class must have:
A constructor(client, sharedServices)
A load() method.
A name property (string).
A version property (string).
It can optionally provide:
5. A commands property (array of Discord slash command objects).
6. An eventListeners property (array of Discord event listener objects).
7. A registerWebRoutes(webApp) method (function).
Shared Services
The sharedServices object is passed to your plugin's constructor and contains:
db: The database connection pool (e.g., mysql.createPool()).
webApp: The Express app instance, for registering routes.
config: The process.env object.
logger: The logger factory function, getLogger(contextName).
Example Plugin Class
const { SlashCommandBuilder } = require('discord.js');

class MyAwesomePlugin {
    /**
     * Constructor is called by the PluginManager.
     * @param {Client} client - The Discord.js Client instance.
     * @param {object} sharedServices - An object containing shared services.
     * @param {any} sharedServices.db - Database connection pool.
     * @param {Express} sharedServices.webApp - Express app instance.
     * @param {object} sharedServices.config - The process.env config.
     * @param {function} sharedServices.logger - The getLogger factory.
     */
    constructor(client, sharedServices) {
        // --- Required properties ---
        this.name = "My Awesome Plugin";
        this.version = "1.0.0";

        // --- Store references ---
        this.client = client;
        this.db = sharedServices.db;
        this.config = sharedServices.config;
        this.logger = sharedServices.logger(this.name); // Create a context-aware logger

        this.logger.info("Constructor called");
    }

    /**
     * Load method is called by the PluginManager after construction.
     * This is where you should set up your plugin's properties.
     */
    load() {
        this.logger.info("Plugin is loading...");

        // --- Define Commands ---
        this.commands = [
            {
                data: new SlashCommandBuilder()
                    .setName('my-command')
                    .setDescription('A command from my awesome plugin.'),
                execute: this.handleMyCommand.bind(this) // Bind 'this'
            }
        ];

        // --- Define Event Listeners ---
        this.eventListeners = [
            {
                event: 'messageCreate',
                once: false,
                execute: this.handleMessage.bind(this) // Bind 'this'
            }
        ];
        
        this.logger.info("Plugin loaded successfully.");
    }

    /**
     * registerWebRoutes is called by the PluginManager if it exists.
     * @param {Express} webApp - The Express app instance.
     */
    registerWebRoutes(webApp) {
        this.logger.info("Registering web routes...");
        
        webApp.get('/my-plugin/dashboard', (req, res) => {
            // Example:
            // const data = await this.db.query("SELECT * FROM my_plugin_table");
            // res.render('my-plugin-view', { data });
            res.send(`Hello from ${this.name}!`);
        });
    }

    // --- Command Handlers ---
    async handleMyCommand(interaction) {
        await interaction.reply(`Hello from ${this.name}!`);
    }

    // --- Event Handlers ---
    async handleMessage(message) {
        if (message.author.bot) return;
        if (message.content.includes('awesome')) {
            this.logger.info(`Reacting to message ${message.id}`);
            message.react('🎉');
        }
    }
}

// --- REQUIRED ---
// Module must export the plugin class
module.exports = MyAwesomePlugin;



