const { Events } = require('discord.js');
const logger = require('@helpers/logger');
const reactionRoleManager = require('@helpers/reactionRoleManager');

/**
 * Handles the messageReactionAdd event.
 * @param {import('discord.js').MessageReaction} reaction The reaction object.
 * @param {import('discord.js').User} user The user who reacted.
 */
async function handleReactionAdd(reaction, user) {
    // Ignore bots
    if (user.bot) return;

    // If the message is partial, fetch it
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            logger.error('Failed to fetch partial message on reaction add:', error);
            return;
        }
    }

    const { message } = reaction;
    const emojiIdentifier = reaction.emoji.toString(); // Use toString() for a consistent identifier

    const roleId = await reactionRoleManager.getRoleId(message.guild.id, message.id, emojiIdentifier);

    if (roleId) {
        try {
            const member = await message.guild.members.fetch(user.id);
            const role = await message.guild.roles.fetch(roleId);
            if (role && member) {
                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    logger.info(`Added role '${role.name}' to '${user.tag}' in guild '${message.guild.name}'.`);
                }
            }
        } catch (error) {
            logger.error(`Failed to add reaction role:`, error);
        }
    }
}

/**
 * Handles the messageReactionRemove event.
 * @param {import('discord.js').MessageReaction} reaction The reaction object.
 * @param {import('discord.js').User} user The user whose reaction was removed.
 */
async function handleReactionRemove(reaction, user) {
    if (user.bot) return;

    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            logger.error('Failed to fetch partial message on reaction remove:', error);
            return;
        }
    }

    const { message } = reaction;
    const emojiIdentifier = reaction.emoji.toString(); // Use toString() for a consistent identifier

    const roleId = await reactionRoleManager.getRoleId(message.guild.id, message.id, emojiIdentifier);

    if (roleId) {
        try {
            const member = await message.guild.members.fetch(user.id);
            const role = await message.guild.roles.fetch(roleId);
            if (role && member) {
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    logger.info(`Removed role '${role.name}' from '${user.tag}' in guild '${message.guild.name}'.`);
                }
            }
        } catch (error) {
            logger.error(`Failed to remove reaction role:`, error);
        }
    }
}

/**
 * Registers all necessary event listeners for the reaction role system.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function registerReactionEvents(client) {
    client.on(Events.MessageReactionAdd, handleReactionAdd);
    client.on(Events.MessageReactionRemove, handleReactionRemove);
    logger.info('Reaction role event handlers registered.');
}

module.exports = {
    registerReactionEvents,
};

