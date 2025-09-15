const configManager = require('@helpers/configManager');
const characterManager = require('@helpers/characterManager');
const logger = require('@helpers/logger');

/**
 * Logs the usage of a slash command to the designated audit channel.
 * Now includes the full command with all options.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object from the command.
 */
async function logCommand(interaction) {
    const config = configManager.get();
    // **FIX**: Updated the key to match the user's database entry.
    const auditChannelId = config.auditLogChannelId;

    if (!auditChannelId) {
        // This warning will now only appear if the 'auditLogChannelId' key is truly missing from the database.
        logger.warn('Audit logging is enabled but auditLogChannelId is not configured in the database.');
        return;
    }

    try {
        const channel = await interaction.client.channels.fetch(auditChannelId);
        if (!channel) {
            logger.warn(`Could not find the audit channel with ID: ${auditChannelId}`);
            return;
        }

        const user = await characterManager.getChars(interaction.user.id);
        const characterMain = user ? user.main_character : interaction.user.username;
        const timestamp = Math.floor(Date.now() / 1000);

        // interaction.toString() automatically formats the command and its options.
        // e.g., "/promote user: @Username rank: Leadership"
        const fullCommand = interaction.toString();

        const logMessage = `**${characterMain}** used command \`${fullCommand}\` at <t:${timestamp}:f>`;

        await channel.send(logMessage);

    } catch (error) {
        logger.error('Failed to log command to audit channel:', error);
    }
}

module.exports = {
    logCommand,
};

