const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Handles the logic for the /embed create and /embed edit subcommands.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleCreateEdit(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const embedName = interaction.options.getString('name');
    const guild = interaction.guild;
    const mode = subcommand; // 'create' or 'edit'

    // For the 'edit' command, we must first verify the embed exists in this guild.
    if (mode === 'edit') {
        const [existing] = await db.query('SELECT embed_name FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, guild.id]);
        if (!existing) {
            return interaction.reply({
                content: `An embed named \`${embedName}\` was not found in this server.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    const token = uuidv4();

    // Store token with necessary context.
    interaction.client.activeEmbedTokens.set(token, {
        interaction, // Pass the whole interaction object
        user: interaction.user,
        guild: interaction.guild,
        mode,
        embedName // Will be the name for 'edit' or the new name for 'create'
    });

    // Set token expiration.
    const EXPIRATION_MINUTES = 30;
    setTimeout(() => {
        if (interaction.client.activeEmbedTokens.has(token)) {
            logger.warn(`Embed Token ${token} for ${interaction.user.tag} has expired.`);
            interaction.client.activeEmbedTokens.delete(token);
        }
    }, EXPIRATION_MINUTES * 60 * 1000);

    const formUrl = `http://${process.env.HOST_NAME}/embed/${token}`;
    const actionWord = mode;

    await interaction.reply({
        content: `Click the button below to **${actionWord}** your embed. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        label: `Open Embed ${actionWord.charAt(0).toUpperCase() + actionWord.slice(1)}or`,
                        style: 5,
                        url: formUrl
                    }
                ]
            }
        ],
        flags: [MessageFlags.Ephemeral]
    });
}


module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Manage, create, and send custom embeds.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Opens the web creator to build a new embed.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The unique name for your new embed.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Opens the web editor for an existing embed.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the embed to edit.')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Sends a pre-saved embed to a channel.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the embed to send.')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send the embed to.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message_content')
                        .setDescription('Optional text message to send with the embed.')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all saved embeds for this server.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes a saved embed and its last sent message.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the embed to delete.')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        try {
            const embeds = await db.query('SELECT embed_name FROM saved_embeds WHERE guild_id = ? AND embed_name LIKE ? ORDER BY embed_name LIMIT 25', [interaction.guild.id, `%${focusedValue}%`]);
            await interaction.respond(
                embeds.map(embed => ({ name: embed.embed_name, value: embed.embed_name }))
            );
        } catch (error) {
            logger.error('Autocomplete for /embed failed:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create' || subcommand === 'edit') {
            await handleCreateEdit(interaction);

        } else if (subcommand === 'send') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const embedName = interaction.options.getString('name');
            const channel = interaction.options.getChannel('channel');
            const messageContent = interaction.options.getString('message_content');

            const [result] = await db.query('SELECT embed_data, content FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, interaction.guild.id]);

            if (!result) {
                return interaction.editReply(`Could not find an embed named \`${embedName}\`.`);
            }

            try {
                // The content from the slash command overrides the saved content
                const contentToSend = messageContent !== null ? messageContent : result.content;
                const embedData = typeof result.embed_data === 'string' ? JSON.parse(result.embed_data) : result.embed_data;
                const embedToSend = new EmbedBuilder(embedData);

                const sentMessage = await channel.send({ content: contentToSend, embeds: [embedToSend] });

                // Save the message info to the database
                await db.query(
                    'UPDATE saved_embeds SET last_sent_channel_id = ?, last_sent_message_id = ? WHERE embed_name = ? AND guild_id = ?',
                    [sentMessage.channel.id, sentMessage.id, embedName, interaction.guild.id]
                );

                await interaction.editReply(`✅ Embed \`${embedName}\` has been sent to ${channel}.`);
            } catch (error) {
                logger.error(`Failed to send embed "${embedName}":`, error);
                await interaction.editReply('There was an error parsing or sending the embed. Check my permissions in that channel.');
            }

        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const embedsFromDb = await db.query('SELECT embed_name, last_edited_at, last_sent_channel_id, last_sent_message_id FROM saved_embeds WHERE guild_id = ? ORDER BY embed_name', [interaction.guild.id]);

            if (!embedsFromDb || embedsFromDb.length === 0) {
                return interaction.editReply('There are no saved embeds for this server.');
            }

            const validationPromises = embedsFromDb.map(async (embed) => {
                // If the embed has never been sent, it's valid to be listed.
                if (!embed.last_sent_channel_id || !embed.last_sent_message_id) {
                    return { ...embed, isValid: true };
                }

                try {
                    const channel = await interaction.client.channels.fetch(embed.last_sent_channel_id);
                    // Fetching the message will throw an error if it doesn't exist.
                    await channel.messages.fetch(embed.last_sent_message_id);
                    return { ...embed, isValid: true };
                } catch (error) {
                    // 10008 is the error code for "Unknown Message".
                    // 10003 is the error code for "Unknown Channel".
                    if (error.code === 10008 || error.code === 10003) {
                        logger.info(`Message for embed '${embed.embed_name}' not found. Marking for DB cleanup.`);
                        return { ...embed, isValid: false };
                    }
                    // For other errors (like permissions), we'll assume the message exists for now.
                    logger.warn(`Could not verify message for embed '${embed.embed_name}':`, error.message);
                    return { ...embed, isValid: true };
                }
            });

            const validationResults = await Promise.all(validationPromises);

            const validEmbeds = [];
            const cleanupPromises = [];

            for (const result of validationResults) {
                if (result.isValid) {
                    validEmbeds.push(result);
                } else {
                    // If the message is not valid (deleted), queue a DB update to clear the message/channel IDs.
                    const promise = db.query(
                        'UPDATE saved_embeds SET last_sent_channel_id = NULL, last_sent_message_id = NULL WHERE embed_name = ? AND guild_id = ?',
                        [result.embed_name, interaction.guild.id]
                    );
                    cleanupPromises.push(promise);
                }
            }

            // Perform the database cleanup in the background.
            if (cleanupPromises.length > 0) {
                Promise.all(cleanupPromises).then(() => {
                    logger.info(`Cleaned up ${cleanupPromises.length} invalid embed message links from the database.`);
                }).catch(err => {
                    logger.error('Failed to clean up invalid embed message links:', err);
                });
            }

            if (validEmbeds.length === 0) {
                return interaction.editReply('There are no saved embeds for this server (some may have been removed from the list because their last sent message was deleted).');
            }

            const description = validEmbeds.map(e => `🔹 **${e.embed_name}** (Last edited: <t:${Math.floor(new Date(e.last_edited_at).getTime() / 1000)}:R>)`).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Saved Embeds')
                .setDescription(description)
                .setColor(0x5865F2)
                .setFooter({ text: `Found ${validEmbeds.length} embeds.` });

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'delete') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const embedName = interaction.options.getString('name');

            // First, find the embed to get its message ID
            const [embedToDelete] = await db.query('SELECT last_sent_channel_id, last_sent_message_id FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, interaction.guild.id]);

            if (!embedToDelete) {
                return interaction.editReply(`❌ Could not find an embed named \`${embedName}\` to delete.`);
            }

            let messageDeletedText = '';
            // If there's a message associated, try to delete it
            if (embedToDelete.last_sent_channel_id && embedToDelete.last_sent_message_id) {
                try {
                    const channel = await interaction.client.channels.fetch(embedToDelete.last_sent_channel_id);
                    const message = await channel.messages.fetch(embedToDelete.last_sent_message_id);
                    await message.delete();
                    messageDeletedText = ' Its last sent message was also deleted.';
                } catch (error) {
                    logger.warn(`Could not delete message for embed '${embedName}' (ID: ${embedToDelete.last_sent_message_id}). It might have been deleted already.`, error.message);
                    messageDeletedText = ' Its last sent message could not be found or deleted.';
                }
            }

            // Now, delete the embed from the database
            const result = await db.query('DELETE FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, interaction.guild.id]);

            if (result.affectedRows > 0) {
                await interaction.editReply(`✅ Successfully deleted the embed named \`${embedName}\`.${messageDeletedText}`);
            } else {
                // This case should be rare since we checked first, but it's good practice.
                await interaction.editReply(`❌ Could not find an embed named \`${embedName}\` to delete.`);
            }
        }
    },
};

