const { EmbedBuilder } = require('discord.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

/**
 * Sends a log message to the configured action log channel.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {EmbedBuilder} embed The embed to send.
 */
async function logAction(client, embed) {
    const config = configManager.get();
    if (!config || !config.actionLogChannelId || !config.actionLogChannelId[0]) {
        // This is a common case if not configured, so we don't need to log a warning every time.
        return;
    }

    try {
        const channel = await client.channels.fetch(config.actionLogChannelId[0]);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        } else {
            logger.warn(`Could not find a valid text channel with ID: ${config.actionLogChannelId[0]}`);
        }
    } catch (error) {
        logger.error('Failed to send action log message:', error);
    }
}

module.exports = { logAction };
