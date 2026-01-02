const { SlashCommandBuilder, REST, Routes } = require('discord.js');
const { getLogger } = require('@services/logger');
const IncursionManager = require('./managers/incursionManager');
const AuthManager = require('./managers/authManager');
const ConfigManager = require('./managers/configManager');
const StatusManager = require('./managers/statusManager');
const ReminderManager = require('./managers/reminderManager');
const WalletMonitor = require('./walletMonitor');

// legacy -- replace ---
//const esiService = require('@services/esiService');

// --- IMPORT YOUR OLD HANDLERS/MANAGERS ---
// We will now import the *logic* from the old files
const interactionCreateHandler = require('../../events/interactionCreate');


/**
 * This is an example of how your *existing* functionality can be
 * migrated into a "core" plugin.
 *
 * You would move all logic from `commands/`, `events/`, `helpers/`, and `web/`
 * into a plugin like this.
 */
class CoreFunctionalityPlugin {

    constructor(client, sharedServices) {
        // --- Required properties ---
        this.name = "WIT Core";
        this.version = "3.0.0";

        // --- Legacy Helpers ---

        // --- Store references ---
        this.client = client;
        this.esiService = sharedServices.esiService;
        this.db = sharedServices.db;
        this.config = sharedServices.config;
        this.logger = sharedServices.logger(this.name);
        this.WebTokenService = sharedServices.WebTokenService;

        // --- Inject Managers ---
        this.incursionManager = new IncursionManager(this);
        this.statusManager = new StatusManager(this);
        this.reminderManager = new ReminderManager(this);
        this.authManager = new AuthManager(this);
        this.configManager = new ConfigManager(this);
        // --- Dependancies authmanager & configManager --- 
        this.walletMonitor = new WalletMonitor(this);
        // --- End ---

        this.logger.info("Core plugin constructed.");
    }

    /**
     * Load method is called by the PluginManager.
     */
    load() {
        this.logger.info("Core plugin is loading...");

        // --- 1. Define Commands ---
        this.commands = []; // Start with an empty array

        // --- We will migrate commands here later ---
        // EXAMPLE:
        // this.commands.push({
        //     data: new SlashCommandBuilder().setName('ping-core').setDescription('Replies with Pong! (from core)'),
        //     execute: async (interaction) => {
        //         await interaction.reply('Pong from core!');
        //     }
        // });

        this.logger.info(`Loaded ${this.commands.length} core commands.`);


        // --- 2. Define Event Listeners ---
        // You would load these from your `events/` files
        // NOTE: `interactionCreate` and `clientReady` are handled in app.js for now,
        // but could be moved here.
        const reactionHandler = require('../../events/reactionHandler'); // Example

        this.eventListeners = [
            {
                event: 'messageReactionAdd',
                once: false,
                execute: (reaction, user) => reactionHandler.execute(this.client, reaction, user, 'add')
            },
            {
                event: 'messageReactionRemove',
                once: false,
                execute: (reaction, user) => reactionHandler.execute(this.client, reaction, user, 'remove')
            }
            // ... add all other event listeners (actionLogHandler, etc.)
        ]
        // --- ADD THIS BLOCK: Core Event Handlers ---
        this.eventListeners.push({
            event: 'interactionCreate',
            once: false,
            execute: (...args) => interactionCreateHandler.execute(this.client, ...args)
        });

        // --- REPLACE THE OLD 'ready' HANDLER WITH THIS ---
        this.eventListeners.push({
            event: 'clientReady',
            once: true,
            execute: async () => {
                this.logger.info(`Bot is ready! Logged in as ${this.client.user.tag}`);

                // --- 1. DEPLOY SLASH COMMANDS ---
                if (!this.client.commandData || this.client.commandData.length === 0) {
                    this.logger.warn('No command data found on client. Skipping deployment.');
                    return;
                }

                const rest = new REST().setToken(this.config.DISCORD_TOKEN);
                const guildId = this.config.GUILD_ID; // <-- Use your existing GUILD_ID

                if (!guildId) {
                    this.logger.error('GUILD_ID is not set in .env file. Cannot deploy commands.');
                    return;
                }

                try {
                    this.logger.info(`Started refreshing ${this.client.commandData.length} application (/) commands for guild ${guildId}.`);

                    // --- Deploy to your specific Guild (Instant) ---
                    const data = await rest.put(
                        Routes.applicationGuildCommands(this.client.user.id, guildId),
                        { body: this.client.commandData },
                    );

                    this.logger.info(`Successfully reloaded ${data.length} (/) commands for guild ${guildId}.`);

                } catch (error) {
                    this.logger.error('Failed to reload application (/) commands:', { error });
                }

                // --- 2. RUN OLD clientReady.js LOGIC ---
                try {
                    this.logger.info('Running core clientReady tasks...');

                    this.logger.info('Initializing wallet transaction ID cache...');
                    await this.walletMonitor.initializeLastTransactionIds();
                    this.logger.info('Wallet transaction ID cache initialized.');

                    this.logger.info('Restoring saved status...');
                    await this.statusManager.restoreSavedStatus();

                    this.logger.info('Loading and scheduling reminders...');
                    await this.reminderManager.loadAndScheduleReminders();

                    this.logger.info('Starting incursion monitor...');
                    await this.incursionManager.updateIncursions()

                    this.logger.success('All clientReady tasks completed.');
                } catch (error) {
                    this.logger.error('Error making clientReady:', { error });
                }
            }
        });
        // --- END OF REPLACEMENT BLOCK ---

        this.logger.info(`Loaded ${this.eventListeners.length} core event listeners.`);

        this.logger.info("Core plugin loaded.");
    }

    /**
     * 3. Register Web Routes
     * You would load these from your `web/routes/` files
     */
    registerWebRoutes(webApp) {
        this.logger.info("Registering core web routes...");

        // --- Example for SRP routes ---
        // const srpController = require('../../web/controllers/srpController')(this.client, this.db);
        // const srpRouter = require('../../web/routes/srpRoutes')(srpController);

        // This is how you would have loaded it before:
        // webApp.use('/srp', srpRouter);

        // --- NEW PATTERN ---
        // Here, we define the routes directly and apply the middleware.
        // 1. The GET route requires a valid token, but does NOT consume it
        webApp.get(
            '/srp/form',
            this.WebTokenService.validateTokenMiddleware('srp', false), // <-- consumeToken = false
            (req, res) => {
                // If we get here, the token was valid.
                // We *must* pass the token to the template.
                res.render('srpForm', {
                    userId: req.tokenData.user_id,
                    token: req.tokenData.token // Pass the token itself back to the form
                });
            }
        );

        // 2. The POST route validates AND consumes the token
        webApp.post(
            '/srp/submit',
            this.WebTokenService.validateTokenMiddleware('srp', true), // <-- consumeToken = true
            (req, res) => {
                // If we get here, the token was valid and has now been consumed.
                // The token data is available from the middleware.

                // Process the form submission...
                // const { zkill, details } = req.body;
                // const userId = req.tokenData.user_id;
                // this.srpManager.process(userId, zkill, details);

                // Show success
                res.render('success', { message: 'SRP submitted successfully!' });
            }
        );

        // ... register all other routes (isk, logi, quiz, etc.)

        this.logger.info("Core web routes registered.");
    }
}

// --- REQUIRED ---
module.exports = CoreFunctionalityPlugin;