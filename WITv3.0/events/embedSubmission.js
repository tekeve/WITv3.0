const { EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Splits a string into chunks of a specified maximum length, handling oversized lines.
 * @param {string} text The text to split.
 * @param {number} [maxLength=2000] The maximum length of each chunk.
 * @returns {string[]} An array of text chunks.
 */
function splitMessage(text, maxLength = 2000) {
    const chunks = [];
    let currentChunk = '';

    if (!text) return chunks;

    const lines = text.split('\n');
    for (const line of lines) {
        if (line.length > maxLength) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            const lineChunks = line.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
            chunks.push(...lineChunks);
            continue;
        }

        if (currentChunk.length + line.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

module.exports = {
    name: 'embedSubmission',
    async execute(payload, client, callback) {
        const { user, guildId, formData, isEditing, originalName } = payload;
        const action = formData.action;

        try {
            // 1. Construct the Embed Object from Form Data
            const embedObject = {};
            if (formData.title) embedObject.title = formData.title;
            if (formData.description) embedObject.description = formData.description;
            if (formData.url) embedObject.url = formData.url;
            if (formData.color && formData.color.match(/^#[0-9a-f]{6}$/i)) {
                embedObject.color = parseInt(formData.color.replace('#', ''), 16);
            }
            if (formData.timestamp === 'on') embedObject.timestamp = new Date().toISOString();

            if (formData.author_name) {
                embedObject.author = { name: formData.author_name };
                if (formData.author_url) embedObject.author.url = formData.author_url;
                if (formData.author_icon_url) embedObject.author.icon_url = formData.author_icon_url;
            }

            if (formData.footer_text) {
                embedObject.footer = { text: formData.footer_text };
                if (formData.footer_icon_url) embedObject.footer.icon_url = formData.footer_icon_url;
            }

            if (formData.thumbnail_url) embedObject.thumbnail = { url: formData.thumbnail_url };
            if (formData.image_url) embedObject.image = { url: formData.image_url };

            embedObject.fields = [];
            if (formData.fields && formData.fields.name) {
                for (let i = 0; i < formData.fields.name.length; i++) {
                    if (formData.fields.name[i] && formData.fields.value[i]) {
                        embedObject.fields.push({
                            name: formData.fields.name[i],
                            value: formData.fields.value[i],
                            inline: formData.fields.inline && formData.fields.inline[i] === 'on'
                        });
                    }
                }
            }

            // 2. Save/Update Logic
            if (action.startsWith('save')) {
                const newEmbedName = formData.embed_name;
                if (!newEmbedName) {
                    return callback(false, 'An embed name is required to save.');
                }

                const embedDataString = JSON.stringify(embedObject);

                if (isEditing) {
                    const isRenaming = newEmbedName !== originalName;
                    if (isRenaming) {
                        const existingCheck = await db.query('SELECT embed_name FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [newEmbedName, guildId]);
                        if (existingCheck.length > 0) {
                            return callback(false, `An embed with the name "${newEmbedName}" already exists. Please choose a different name.`);
                        }
                    }
                    const updateSql = `
                        UPDATE saved_embeds 
                        SET embed_name = ?, embed_data = ?, last_edited_by_id = ?, last_edited_by_tag = ?
                        WHERE embed_name = ? AND guild_id = ?
                    `;
                    await db.query(updateSql, [newEmbedName, embedDataString, user.id, user.tag, originalName, guildId]);
                    logger.success(`Embed "${originalName}" updated to "${newEmbedName}" in guild ${guildId} by ${user.tag}.`);
                } else {
                    const existingCheck = await db.query('SELECT embed_name FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [newEmbedName, guildId]);
                    if (existingCheck.length > 0) {
                        return callback(false, `An embed with the name "${newEmbedName}" already exists. Use /embed edit to modify it.`);
                    }
                    const insertSql = `
                        INSERT INTO saved_embeds (guild_id, embed_name, embed_data, created_by_id, created_by_tag, last_edited_by_id, last_edited_by_tag)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;
                    await db.query(insertSql, [guildId, newEmbedName, embedDataString, user.id, user.tag, user.id, user.tag]);
                    logger.success(`Embed "${newEmbedName}" saved in guild ${guildId} by ${user.tag}.`);
                }
            }

            // 3. Send Logic
            if (action === 'save_and_send' || action === 'send_only') {
                if (!formData.channel_id) {
                    return callback(false, 'A channel must be selected to send the embed.');
                }

                const channel = await client.channels.fetch(formData.channel_id);
                if (!channel) {
                    return callback(false, 'The selected channel could not be found.');
                }

                const finalEmbed = new EmbedBuilder(embedObject);
                const contentChunks = splitMessage(formData.message_content, 2000);

                if (contentChunks.length > 0) {
                    for (let i = 0; i < contentChunks.length; i++) {
                        const chunk = contentChunks[i];
                        const isLastChunk = i === contentChunks.length - 1;
                        await channel.send({ content: chunk, embeds: isLastChunk ? [finalEmbed] : [] });
                    }
                } else {
                    await channel.send({ embeds: [finalEmbed] });
                }

                logger.success(`Embed sent to #${channel.name} by ${user.tag}.`);
            }

            let successMessage = `Embed "${formData.embed_name}" has been saved successfully!`;
            if (action === 'save_and_send') successMessage = `Embed "${formData.embed_name}" has been saved and sent!`;
            if (action === 'send_only') successMessage = `Embed has been sent!`;

            callback(true, successMessage);

        } catch (error) {
            logger.error('Failed to process embed submission:', error);
            callback(false, 'A database error occurred. Please ensure the embed name is unique and all fields are valid.');
        }
    }
};

