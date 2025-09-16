const { EmbedBuilder } = require('discord.js');
const configManager = require('./configManager');
const logger = require('./logger');
const charManager = require('./characterManager');

/**
 * Logs a command usage to the designated audit channel.
 * @param {import('discord.js').Interaction} interaction The interaction object from the command.
 */
async function logCommand(interaction) {
    const config = configManager.get();
    if (!config || !config.auditLogChannelId) {
        // Silently fail if the channel is not configured, but log a warning once on startup.
        return;
    }

    try {
        const channel = await interaction.client.channels.fetch(config.auditLogChannelId);
        if (!channel) {
            logger.warn(`Could not find audit log channel with ID: ${config.auditLogChannelId}`);
            return;
        }

        const charData = await charManager.getChars(interaction.user.id);
        const characterName = charData?.main?.character_name || interaction.user.tag;
        const fullCommand = interaction.toString();

        const embed = new EmbedBuilder()
            .setColor(0x4E5D94)
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`**Character:** ${characterName}\n**Command:** \`${fullCommand}\``)
            .setTimestamp();

        await channel.send({ embeds: [embed] });

    } catch (error) {
        logger.error('Failed to send audit log:', error);
    }
}

// Initial check on startup
function checkConfig() {
    const config = configManager.get();
    if (!config || !config.auditLogChannelId) {
        logger.warn('Audit logging is enabled but auditLogChannelId is not configured in the database.');
    }
}

module.exports = {
    logCommand,
    checkConfig
};

