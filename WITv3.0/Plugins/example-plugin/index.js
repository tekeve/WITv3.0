// --- plugins/example-plugin/index.js ---
// This is a simple plugin that adds a !ping command
// and logs when the bot is ready.

/**
 * @param {object} services - Core services injected from app.js
 * @param {object} services.client - The Discord.js client
 * @param {object} services.database - The database service
 * @param {object} services.logger - The logger service
 */
function initialize(services) {
    const { client, logger } = services;

    logger.info('Initializing Example Plugin...');

    // 1. Listen for the 'ready' event
    client.on('ready', () => {
        logger.info(`[ExamplePlugin] Bot is ready! Logged in as ${client.user.username}`);
    });

    // 2. Listen for 'messageCreate' events
    client.on('messageCreate', (message) => {
        // Ignore bots
        if (message.author.bot) return;

        // Respond to !ping
        if (message.content === '!ping') {
            logger.info(`[ExamplePlugin] Responding to !ping from ${message.author.username}`);
            message.reply('Pong from the example plugin!');
        }
    });

    // 3. You could also register slash commands here
    // (Assuming your services.client.commands is a Map)
    const pingCommand = {
        name: 'ping',
        description: 'Replies with Pong! (from a plugin)',
        execute: async (interaction) => {
            await interaction.reply('Pong from the example plugin!');
        }
    };

    if (client.commands) {
        client.commands.set(pingCommand.name, pingCommand);
        logger.info('[ExamplePlugin] Registered /ping slash command.');
    }
}

// Export the initialize function so app.js can call it
module.exports = {
    initialize
};
