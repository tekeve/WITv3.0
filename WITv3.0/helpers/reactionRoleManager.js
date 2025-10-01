const db = require('@helpers/database');
const logger = require('@helpers/logger');
const { EmbedBuilder } = require('discord.js');

let reactionRoleCache = new Map();

/**
 * Loads all reaction role configurations from the database into an in-memory cache.
 */
async function loadReactionRoles() {
    try {
        const rows = await db.query('SELECT guild_id, message_id, emoji, role_id FROM reaction_roles');
        reactionRoleCache.clear();
        for (const row of rows) {
            if (!reactionRoleCache.has(row.message_id)) {
                reactionRoleCache.set(row.message_id, new Map());
            }
            reactionRoleCache.get(row.message_id).set(row.emoji, row.role_id);
        }
        logger.success(`Loaded ${rows.length} reaction role configurations into cache.`);
    } catch (error) {
        logger.error('Failed to load reaction roles from database:', error);
    }
}

/**
 * Gets a role ID for a given message and emoji from the cache.
 * @param {string} guildId
 * @param {string} messageId
 * @param {string} emojiIdentifier
 * @returns {Promise<string|null>}
 */
async function getRoleId(guildId, messageId, emojiIdentifier) {
    if (reactionRoleCache.size === 0) {
        await loadReactionRoles();
    }
    const messageRoles = reactionRoleCache.get(messageId);
    return messageRoles ? messageRoles.get(emojiIdentifier) : null;
}

/**
 * Gets all reaction role configurations for a guild, grouped by message.
 * @param {string} guildId
 * @returns {Promise<Map<string, {channelId: string, roles: Array<{emoji: string, roleId: string}>}>>}
 */
async function getGuildReactionRoles(guildId) {
    try {
        const rows = await db.query('SELECT message_id, channel_id, emoji, role_id FROM reaction_roles WHERE guild_id = ?', [guildId]);
        const grouped = new Map();

        for (const row of rows) {
            if (!grouped.has(row.message_id)) {
                grouped.set(row.message_id, { channelId: row.channel_id, roles: [] });
            }
            grouped.get(row.message_id).roles.push({ emoji: row.emoji, roleId: row.role_id });
        }
        return grouped;
    } catch (error) {
        logger.error('Failed to get guild reaction roles:', error);
        return new Map();
    }
}


module.exports = {
    loadReactionRoles,
    getRoleId,
    getGuildReactionRoles,
};
