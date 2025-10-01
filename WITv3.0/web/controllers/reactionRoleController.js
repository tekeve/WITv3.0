const logger = require('@helpers/logger');
const db = require('@helpers/database');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const reactionRoleManager = require('@helpers/reactionRoleManager');

/**
 * Renders the Reaction Roles management form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.showForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeReactionRoleTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This management link is invalid or has expired.' });
    }

    try {
        const { guild } = tokenData;
        await guild.roles.fetch();
        await guild.emojis.fetch();

        const roles = guild.roles.cache
            .filter(r => !r.managed && r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const emojis = guild.emojis.cache
            .map(e => ({ id: e.id, name: e.name, identifier: e.toString() }));

        const channels = guild.channels.cache
            .filter(c => c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const existingSetups = await reactionRoleManager.getGuildReactionRoles(guild.id);

        // Convert Map to array and fetch message content for each
        const setupsArray = await Promise.all(Array.from(existingSetups.entries()).map(async ([messageId, data]) => {
            let content = '[Could not fetch message content]';
            try {
                const channel = await client.channels.fetch(data.channelId);
                const message = await channel.messages.fetch(messageId);
                content = message.content;
            } catch (e) {
                logger.warn(`Could not fetch message ${messageId} for reaction role form.`);
            }
            return { messageId, ...data, content };
        }));

        res.render('reactionRoleForm', {
            token,
            roles,
            emojis,
            channels,
            existingSetups: setupsArray
        });
    } catch (error) {
        logger.error('Error preparing reaction roles page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load server data.' });
    }
};

/**
 * Handles the submission of the Reaction Roles form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
exports.handleSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeReactionRoleTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Expired', message: 'This form has expired. Your changes were not saved.' });
    }

    const { interaction, guild } = tokenData;
    const {
        message_option,
        existing_message_id,
        channel_id,
        message_content,
        reactions, // This will be an array of objects
        delete_setup
    } = req.body;

    // Invalidate token
    client.activeReactionRoleTokens.delete(token);

    try {
        // Handle deletion
        if (delete_setup) {
            const messageIdToDelete = delete_setup;
            const [setup] = await db.query('SELECT channel_id FROM reaction_roles WHERE message_id = ? AND guild_id = ? LIMIT 1', [messageIdToDelete, guild.id]);

            if (setup) {
                try {
                    const channel = await client.channels.fetch(setup.channel_id);
                    const message = await channel.messages.fetch(messageIdToDelete);
                    await message.delete();
                } catch (e) {
                    logger.warn(`Could not delete original reaction role message ${messageIdToDelete}. It might already be gone.`);
                }
            }

            await db.query('DELETE FROM reaction_roles WHERE message_id = ? AND guild_id = ?', [messageIdToDelete, guild.id]);
            await reactionRoleManager.loadReactionRoles();
            await interaction.followUp({ content: `✅ Successfully deleted reaction role setup for message ID ${messageIdToDelete}.`, flags: [MessageFlags.Ephemeral] });
            return res.render('success', { title: 'Setup Deleted', message: `The reaction role setup has been successfully deleted.` });
        }


        let message;
        let targetChannelId = channel_id;
        const reactionsToAdd = Array.isArray(reactions) ? reactions.filter(r => r.emoji && r.role) : [];

        if (reactionsToAdd.length === 0) {
            return res.status(400).render('error', { title: 'No Reactions', message: 'You must configure at least one emoji-to-role mapping.' });
        }

        if (message_option === 'existing') {
            if (!existing_message_id || !channel_id) {
                return res.status(400).render('error', { title: 'Missing Info', message: 'You must provide a Channel ID and a Message ID for existing messages.' });
            }
            try {
                const channel = await client.channels.fetch(channel_id);
                message = await channel.messages.fetch(existing_message_id);

                // If new content is provided (and not just whitespace), edit the message.
                if (message_content && message_content.trim().length > 0) {
                    await message.edit({ content: message_content });
                }

            } catch (e) {
                return res.status(404).render('error', { title: 'Not Found', message: 'Could not find the specified message in the specified channel.' });
            }
        } else { // 'new' message
            if (!channel_id || !message_content) {
                return res.status(400).render('error', { title: 'Missing Info', message: 'You must select a channel and provide message content for a new message.' });
            }
            const channel = await client.channels.fetch(channel_id);
            message = await channel.send(message_content);
        }

        // Clear existing reactions and DB entries for this message
        await message.reactions.removeAll();
        await db.query('DELETE FROM reaction_roles WHERE message_id = ? AND guild_id = ?', [message.id, guild.id]);

        // Add new reactions and DB entries
        for (const reaction of reactionsToAdd) {
            await message.react(reaction.emoji);
            await db.query(
                'INSERT INTO reaction_roles (guild_id, message_id, channel_id, role_id, emoji) VALUES (?, ?, ?, ?, ?)',
                [guild.id, message.id, message.channel.id, reaction.role, reaction.emoji]
            );
        }

        // Reload the cache in the bot
        await reactionRoleManager.loadReactionRoles();

        await interaction.followUp({ content: `✅ Reaction roles have been successfully set up on the message in ${message.channel}.`, flags: [MessageFlags.Ephemeral] });
        res.render('success', { title: 'Setup Complete!', message: 'The reaction roles have been configured. You can now close this window.' });

    } catch (error) {
        logger.error('Error handling reaction role submission:', error);
        await interaction.followUp({ content: '❌ An error occurred while setting up reaction roles. I might be missing permissions to send messages or add reactions in that channel.', flags: [MessageFlags.Ephemeral] });
        res.status(500).render('error', { title: 'Error', message: 'An internal error occurred.' });
    }
};

