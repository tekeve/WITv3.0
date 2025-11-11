const { SlashCommandBuilder } = require('discord.js');

/**
 * A simple, standalone plugin example.
 */
class PingPlugin {

    constructor(client, sharedServices) {
        // --- Required properties ---
        this.name = "Ping Example";
        this.version = "1.0.0";

        // --- Store references ---
        this.client = client;
        this.logger = sharedServices.logger(this.name);

        this.logger.info("Ping plugin constructed.");
    }

    /**
     * Load method is called by the PluginManager.
     */
    load() {
        this.logger.info("Loading Ping plugin...");

        // --- Define Commands ---
        this.commands = [
            {
                data: new SlashCommandBuilder()
                    .setName('ping-plugin')
                    .setDescription('Replies with Pong! (from the example plugin)'),
                execute: this.handlePing.bind(this)
            }
        ];

        this.logger.info("Ping plugin loaded.");
    }

    // --- Command Handlers ---
    async handlePing(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        interaction.editReply(`Pong! 🏓\nRoundtrip latency: ${sent.createdTimestamp - interaction.createdTimestamp}ms\nWebsocket Heartbeat: ${this.client.ws.ping}ms`);
    }
}
module.exports = PingPlugin;