const { EmbedBuilder } = require('discord.js');
const db = require('@helpers/database');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');

// In-memory cache for action log settings
let settingsCache = null;

/**
 * Fetches action log settings from the database or returns the cached version.
 * @returns {Promise<object|null>} The settings object or null on error.
 */
async function getActionLogSettings() {
    if (settingsCache) {
        return settingsCache;
    }
    try {
        const rows = await db.query('SELECT * FROM action_log_settings WHERE id = 1');
        if (rows.length > 0) {
            const settings = rows[0];
            // Ensure ignored lists are arrays
            settings.ignored_channels = settings.ignored_channels ? JSON.parse(settings.ignored_channels) : [];
            settings.ignored_roles = settings.ignored_roles ? JSON.parse(settings.ignored_roles) : [];
            settingsCache = settings;
            return settingsCache;
        }
        return null; // No settings configured
    } catch (error) {
        logger.error('Could not fetch action log settings from DB:', error);
        return null;
    }
}

/**
 * Main function to post a log message after checking settings.
 * @param {import('discord.js').Guild} guild - The guild where the event occurred.
 * @param {string} eventType - The specific event type key from the database (e.g., 'log_message_delete').
 * @param {EmbedBuilder} embed - The pre-built embed to send.
 * @param {object} [context={}] - Optional context for ignore checks.
 * @param {import('discord.js').TextChannel} [context.channel] - The channel where the event happened.
 * @param {import('discord.js').GuildMember} [context.member] - The member associated with the event.
 */
module.exports.postLog = async function (guild, eventType, embed, context = {}) {
    const settings = await getActionLogSettings();
    const config = configManager.get();

    if (!settings || !settings[eventType]) {
        return; // Logging for this event is disabled
    }

    // Check for ignored channels
    if (context.channel && settings.ignored_channels?.includes(context.channel.id)) {
        return;
    }

    // Check for ignored roles
    if (context.member && context.member.roles.cache.some(role => settings.ignored_roles?.includes(role.id))) {
        return;
    }

    const logChannelId = config.actionLogChannelId ? config.actionLogChannelId[0] : null;
    if (!logChannelId) {
        logger.warn('actionLogChannelId is not configured, but an event was triggered.');
        return;
    }

    try {
        const channel = await guild.client.channels.fetch(logChannelId);
        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        logger.error(`Failed to send to action log channel ${logChannelId}:`, error);
    }
};

/**
 * Clears the in-memory settings cache. Called after settings are updated.
 */
module.exports.invalidateSettingsCache = function () {
    settingsCache = null;
    logger.info('Action log settings cache has been invalidated.');
};

