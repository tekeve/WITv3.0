const logger = require('@helpers/logger');
const { ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('@helpers/database');

/**
 * Renders the embed creator form, pre-filling data if in "edit" mode.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the GET request.
 */
exports.showCreator = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeEmbedTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This embed creator link is invalid or has expired.' });
    }

    try {
        const { guild, embedName, mode } = tokenData;
        await guild.channels.fetch();

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        let embedToEdit = null;

        if (mode === 'edit') {
            const [embedRow] = await db.query('SELECT content, embed_data FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [guild.id, embedName]);
            if (embedRow) {
                let parsedData = {};
                // Defensively parse the embed_data, as it could be a string or an object.
                if (typeof embedRow.embed_data === 'string') {
                    try {
                        if (embedRow.embed_data) { // Ensure it's not an empty string
                            parsedData = JSON.parse(embedRow.embed_data);
                        }
                    } catch (e) {
                        logger.error(`Failed to parse embed_data JSON for embed '${embedName}':`, e);
                        // Proceed with an empty object to prevent a crash.
                    }
                } else if (embedRow.embed_data && typeof embedRow.embed_data === 'object') {
                    // It's already a valid object.
                    parsedData = embedRow.embed_data;
                }

                embedToEdit = {
                    embed_data: parsedData,
                    content: embedRow.content || ''
                };
            }
        }

        res.render('embedCreator', {
            token,
            channels,
            embedName,
            mode,
            embedToEdit
        });
    } catch (error) {
        logger.error('Error preparing embed creator page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load server data.' });
    }
};

/**
 * Handles the submission from the embed creator form (Save or Save & Send).
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the POST request.
 */
exports.handleCreatorSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeEmbedTokens?.get(token);

    if (!tokenData) {
        logger.warn(`Attempted submission with invalid or expired embed creator token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Expired',
            message: 'This form link has expired and cannot be submitted. Please generate a new one.',
        });
    }

    const { interaction, guild, user, mode, embedName: originalName } = tokenData;
    const { channelId, embedData, content, embedName: newEmbedName, action } = req.body;

    try {
        if (!newEmbedName) {
            const errorMsg = 'An embed name is required.';
            await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
            return res.status(400).render('error', { title: 'Missing Information', message: errorMsg });
        }

        let parsedEmbed;
        try {
            parsedEmbed = JSON.parse(embedData);
        } catch (error) {
            logger.error('Embed submission failed: Invalid JSON.', error);
            const errorMsg = 'There was an error processing the embed data from the form. It might be invalid JSON.';
            await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
            return res.status(400).render('error', { title: 'Invalid Data', message: errorMsg });
        }

        const embedDataString = JSON.stringify(parsedEmbed);
        let lastSentMessageInfo = {};

        // In edit mode, fetch the last sent message details first
        if (mode === 'edit') {
            const [existing] = await db.query('SELECT last_sent_channel_id, last_sent_message_id FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [guild.id, originalName]);
            if (existing) {
                lastSentMessageInfo = {
                    channelId: existing.last_sent_channel_id,
                    messageId: existing.last_sent_message_id
                };
            }
        }

        if (mode === 'create') {
            const sql = `
                INSERT INTO saved_embeds (embed_name, guild_id, embed_data, content, created_by_id, created_by_tag, last_edited_by_id, last_edited_by_tag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await db.query(sql, [newEmbedName, guild.id, embedDataString, content, user.id, user.tag, user.id, user.tag]);
            logger.success(`Saved new embed '${newEmbedName}' for guild ${guild.id}`);
        } else { // mode === 'edit'
            const isRenaming = newEmbedName !== originalName;
            if (isRenaming) {
                const [existing] = await db.query('SELECT embed_name FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [newEmbedName, guild.id]);
                if (existing) {
                    const errorMsg = `An embed with the name \`${newEmbedName}\` already exists. Please choose a different name.`;
                    await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
                    return res.status(409).render('error', { title: 'Name Conflict', message: errorMsg });
                }
            }
            const sql = `
                UPDATE saved_embeds 
                SET embed_name = ?, embed_data = ?, content = ?, last_edited_by_id = ?, last_edited_by_tag = ?
                WHERE embed_name = ? AND guild_id = ?
            `;
            await db.query(sql, [newEmbedName, embedDataString, content, user.id, user.tag, originalName, guild.id]);
            logger.success(`Updated embed '${originalName}' (now '${newEmbedName}') for guild ${guild.id}`);
        }

        let successMessage = `Embed \`${newEmbedName || originalName}\` has been saved successfully.`;

        // --- NEW SEND/EDIT LOGIC ---
        if (action === 'send') {
            if (!channelId) {
                successMessage += ` but was not sent because no channel was selected.`;
                logger.warn(`Embed '${newEmbedName}' saved but not sent as no channel was provided.`);
            } else {
                let sentMessage = null;
                const channel = await client.channels.fetch(channelId);

                // Check if we should edit an existing message
                if (mode === 'edit' && lastSentMessageInfo.messageId && lastSentMessageInfo.channelId === channelId) {
                    try {
                        const messageToEdit = await channel.messages.fetch(lastSentMessageInfo.messageId);
                        sentMessage = await messageToEdit.edit({ content: content, embeds: [new EmbedBuilder(parsedEmbed)] });
                        successMessage += ` and its existing message in ${channel} was updated.`;
                    } catch (editError) {
                        logger.warn(`Could not edit original message ${lastSentMessageInfo.messageId}, sending a new one. Error: ${editError.message}`);
                        // Fallback to sending a new message if editing fails
                        sentMessage = await channel.send({ content: content, embeds: [new EmbedBuilder(parsedEmbed)] });
                        successMessage += ` and a new message was sent to ${channel} (the old one couldn't be found).`;
                    }
                } else {
                    // Send a new message
                    sentMessage = await channel.send({ content: content, embeds: [new EmbedBuilder(parsedEmbed)] });
                    successMessage += ` and sent to ${channel}.`;
                }

                // If a message was sent or edited, update its ID in the database
                if (sentMessage) {
                    await db.query(
                        'UPDATE saved_embeds SET last_sent_channel_id = ?, last_sent_message_id = ? WHERE embed_name = ? AND guild_id = ?',
                        [sentMessage.channel.id, sentMessage.id, newEmbedName, guild.id]
                    );
                }
            }
        }
        // --- END OF NEW LOGIC ---

        await interaction.followUp({ content: successMessage, flags: [MessageFlags.Ephemeral] });

        res.render('success', { title: 'Success!', message: successMessage + ' You can now close this window.' });

    } catch (error) {
        logger.error(`Error saving/sending embed '${newEmbedName || originalName}':`, error);
        const errorMsg = `A critical error occurred while trying to save or send the embed. Error: ${error.message}`;
        await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] });
        res.status(500).render('error', { title: 'Database Error', message: `Failed to save the embed to the database. Please check the bot's logs.` });
    } finally {
        client.activeEmbedTokens.delete(token);
    }
};


