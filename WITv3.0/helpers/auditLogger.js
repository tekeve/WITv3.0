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

/**
 * Logs a role change event to the designated audit channel.
 * @param {import('discord.js').Interaction} interaction The interaction that triggered the role change.
 * @param {import('discord.js').User} targetUser The user whose roles were changed.
 * @param {string} action The action performed ('promote' or 'demote').
 * @param {string[]} addedRoles An array of role names that were added.
 * @param {string[]} removedRoles An array of role names that were removed.
 */
async function logRoleChange(interaction, targetUser, action, addedRoles, removedRoles) {
    const executor = interaction.user;
    logger.audit(`User ${executor.tag} (${executor.id}) ${action}d ${targetUser.tag} (${targetUser.id}). Added: [${addedRoles.join(', ')}]. Removed: [${removedRoles.join(', ')}].`);

    const config = configManager.get();
    if (!config || !config.auditLogChannelId) {
        return; // Silently fail if channel not configured
    }

    try {
        const channel = await interaction.client.channels.fetch(config.auditLogChannelId);
        if (!channel) {
            logger.warn(`Could not find audit log channel with ID: ${config.auditLogChannelId}`);
            return;
        }

        const executorCharData = await charManager.getChars(executor.id);
        const executorName = executorCharData?.main?.character_name || executor.tag;

        const targetCharData = await charManager.getChars(targetUser.id);
        const targetName = targetCharData?.main?.character_name || targetUser.tag;

        const actionPastTense = action.endsWith('e') ? `${action}d` : `${action}ed`;
        const title = `User ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
        const color = action === 'promote' ? 0x57F287 : 0xED4245; // Green for promote, Red for demote

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setAuthor({ name: `Done by: ${executorName}`, iconURL: executor.displayAvatarURL() })
            .addFields({ name: 'Target User', value: `${targetName} (${targetUser.tag})`, inline: false })
            .setTimestamp();

        if (addedRoles.length > 0) {
            embed.addFields({ name: 'Roles Added', value: addedRoles.join('\n'), inline: true });
        }

        if (removedRoles.length > 0) {
            embed.addFields({ name: 'Roles Removed', value: removedRoles.join('\n'), inline: true });
        }

        await channel.send({ embeds: [embed] });

    } catch (error) {
        logger.error('Failed to send role change audit log:', error);
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
    logRoleChange,
    checkConfig
};

