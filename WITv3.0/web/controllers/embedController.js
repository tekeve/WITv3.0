const logger = require('@helpers/logger');
const { ChannelType } = require('discord.js');
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

        let embedToEdit = {
            embed_data: {},
            content: ''
        };

        if (mode === 'edit') {
            const [embedRow] = await db.query('SELECT content, embed_data FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [guild.id, embedName]);
            if (embedRow) {
                // The data is already a JS object from mysql2, no need to parse
                embedToEdit = {
                    embed_data: embedRow.embed_data || {},
                    content: embedRow.content || ''
                };
            }
        }

        res.render('embedCreator', {
            token,
            channels,
            embedName,
            mode,
            embedToEdit // Pass the data to the view
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

    // Don't delete the token here so the user can be notified of success/failure via the original interaction
    // client.activeEmbedTokens.delete(token);

    const { interaction, guild, user } = tokenData;
    const { channelId, embedData, content, embedName, action } = req.body;

    try {
        let parsedEmbed;
        try {
            // The embedData is coming from a hidden input, so it's a string. Parse it.
            parsedEmbed = JSON.parse(embedData);
        } catch (error) {
            logger.error('Embed submission failed: Invalid JSON.', error);
            return res.status(400).render('error', { title: 'Invalid Data', message: 'The embed data was not valid JSON and could not be saved.' });
        }


        // Save to database
        const sql = `
            INSERT INTO saved_embeds (embed_name, guild_id, embed_data, content, creator_id, creator_tag)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                embed_data = VALUES(embed_data),
                content = VALUES(content),
                creator_id = VALUES(creator_id),
                creator_tag = VALUES(creator_tag),
                updated_at = NOW()
        `;

        // mysql2 will automatically handle the JS object to JSON conversion for the `embed_data` column
        await db.query(sql, [embedName, guild.id, parsedEmbed, content, user.id, user.tag]);
        logger.success(`Saved embed '${embedName}' for guild ${guild.id}`);

        let successMessage = `Embed \`${embedName}\` has been successfully saved.`;

        // If the action is to send, also emit the event
        if (action === 'send') {
            client.emit('embedSubmission', {
                interaction,
                channelId,
                embedData: parsedEmbed, // Send the parsed object
                content
            });
            // The success message for sending is handled in the event handler now
        } else {
            await interaction.followUp({
                content: successMessage,
                flags: [MessageFlags.Ephemeral]
            });
        }

        client.activeEmbedTokens.delete(token); // Clean up token after successful processing
        res.render('success', {
            title: 'Success!',
            message: `Embed '${embedName}' has been saved.` + (action === 'send' ? ' It will be sent to the selected channel shortly.' : '') + ' You can now close this window.',
        });

    } catch (error) {
        logger.error(`Error saving embed '${embedName}':`, error);
        res.status(500).render('error', { title: 'Database Error', message: 'Failed to save the embed to the database.' });
        client.activeEmbedTokens.delete(token); // Clean up token on failure
    }
};

