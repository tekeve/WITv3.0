const { SlashCommandBuilder } = require('discord.js');
const SrpDatabase = require('./srpDatabase');
const SrpManager = require('./managers/srpManager');

/**
 * SRP (Ship Replacement Program) Plugin
 * Provides all functionality related to SRP requests, commands, and web forms.
 */
class SrpPlugin {

    constructor(client, sharedServices) {
        // --- Required properties ---
        this.name = "SRP Plugin";
        this.version = "1.0.0";

        // --- Store references ---
        this.client = client;
        this.logger = sharedServices.logger(this.name);

        // --- Get services published by 'core' ---
        // This relies on 'core' loading first!
        this.shared = sharedServices;
        if (!sharedServices.esiService) {
            this.logger.error('This plugin requires esiService from the "core" plugin. Make sure "core" loads first.');
            throw new Error('Missing core services.');
        }

        // --- Instantiate plugin-specific managers ---
        this.dbManager = new SrpDatabase(sharedServices.db, this.logger);
        this.srpManager = new SrpManager(this, sharedServices, this.dbManager);

        this.logger.info("SRP Plugin constructed.");
    }

    /**
     * Load method is called by the PluginManager.
     */
    load() {
        this.logger.info("Loading SRP commands and events...");

        // --- 1. Define Commands ---
        this.commands = [
            {
                data: new SlashCommandBuilder()
                    .setName('srp')
                    .setDescription('Request an SRP link to submit a loss.'),
                execute: this.handleSrpCommand.bind(this)
            }
            // ... You could add /srp-admin commands here ...
        ];

        // --- 2. Define Event Listeners ---
        // e.g., if you have button interactions for approving/rejecting
        this.eventListeners = [
            // { event: 'interactionCreate', execute: this.handleButton.bind(this) }
        ];

        this.logger.info("SRP Plugin loaded.");
    }

    /**
     * registerWebRoutes is called by the PluginManager.
     */
    registerWebRoutes(webApp) {
        this.logger.info("Registering SRP web routes...");

        const WebTokenService = this.shared.webTokenService;

        // --- 1. The GET route for the form ---
        webApp.get(
            '/srp/form',
            WebTokenService.validateTokenMiddleware('srp', false), // Validate, don't consume
            async (req, res) => {
                try {
                    // req.tokenData is attached by the middleware
                    this.logger.info(`[WEB] Rendering SRP form for user ${req.tokenData.user_id}`);
                    // Render the srpForm.ejs template
                    // Make sure 'srpForm.ejs' exists in your 'web/views/' folder
                    res.render('srpForm', {
                        token: req.query.token // Pass the token back to the form
                    });
                } catch (error) {
                    this.logger.error('[WEB] Failed to render SRP form:', { error: error.stack || error });
                    res.status(500).render('error', { message: 'Error loading SRP form.', error: {} });
                }
            }
        );

        // --- 2. The POST route for the submission ---
        webApp.post(
            '/srp/submit',
            WebTokenService.validateTokenMiddleware('srp', true), // Validate AND consume
            async (req, res) => {
                try {
                    // We now pass the entire form body to the manager
                    const formData = req.body;
                    const { user_id } = req.tokenData;

                    this.logger.info(`[WEB] Processing SRP submission for user ${user_id}`);
                    const success = await this.srpManager.handleSrpSubmission(user_id, formData);

                    if (success) {
                        res.render('success', { message: 'Your SRP request has been submitted successfully.' });
                    } else {
                        res.status(400).render('error', { message: 'Failed to process your SRP request. Please check all fields and try again.', error: {} });
                    }
                } catch (error) {
                    this.logger.error('[WEB] Failed to process SRP submission:', { error: error.stack || error });
                    res.status(500).render('error', { message: 'An internal error occurred.', error: {} });
                }
            }
        );
    }

    // --- Command Handlers ---
    async handleSrpCommand(interaction) {
        try {
            const userId = interaction.user.id;
            const url = await this.srpManager.createSrpLink(userId);

            if (url) {
                await interaction.reply({
                    content: 'Here is your one-time link to submit your SRP request. It will expire in 10 minutes.',
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Submit SRP Request')
                            .setDescription(`[Click here to open the form](${url})`)
                            .setColor(0x00FF00)
                    ],
                    ephemeral: true
                });
            } else {
                await interaction.reply({ content: 'Could not generate an SRP link. Please contact an admin.', ephemeral: true });
            }
        } catch (error) {
            this.logger.error('[CMD] Failed to handle /srp command:', { error: error.stack || error });
            if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
            }
        }
    }
}

// --- REQUIRED ---
module.exports = SrpPlugin;