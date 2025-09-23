const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');
const db = require('@helpers/database');

async function getEmbedsForAutocomplete(guildId, focusedValue) {
    const sql = 'SELECT embed_name FROM saved_embeds WHERE guild_id = ? AND embed_name LIKE ? LIMIT 25';
    const rows = await db.query(sql, [guildId, `%${focusedValue}%`]);
    return rows.map(r => ({ name: r.embed_name, value: r.embed_name }));
}

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Manage custom embeds.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Creates a new embed.')
                .addStringOption(option => option.setName('name').setDescription('A unique name for this embed.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing embed.')
                .addStringOption(option => option.setName('name').setDescription('The name of the embed to edit.').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Sends a saved embed to a channel.')
                .addStringOption(option => option.setName('name').setDescription('The name of the embed to send.').setRequired(true).setAutocomplete(true))
                .addChannelOption(option => option.setName('channel').setDescription('The channel to send the embed to.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all saved embeds.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes a saved embed.')
                .addStringOption(option => option.setName('name').setDescription('The name of the embed to delete.').setRequired(true).setAutocomplete(true))
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (['edit', 'send', 'delete'].includes(interaction.options.getSubcommand()) && focusedOption.name === 'name') {
            const choices = await getEmbedsForAutocomplete(interaction.guildId, focusedOption.value);
            await interaction.respond(choices);
        }
    },

    async execute(interaction) {
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();
        const embedName = interaction.options.getString('name');

        if (subcommand === 'create' || subcommand === 'edit') {
            await handleCreateEdit(interaction, embedName, subcommand);
        } else if (subcommand === 'send') {
            await handleSend(interaction, embedName);
        } else if (subcommand === 'list') {
            await handleList(interaction);
        } else if (subcommand === 'delete') {
            await handleDelete(interaction, embedName);
        }
    },
};

async function handleCreateEdit(interaction, embedName, mode) {
    if (mode === 'create') {
        const existing = await db.query('SELECT embed_name FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [interaction.guildId, embedName]);
        if (existing.length > 0) {
            return interaction.reply({ content: `An embed with the name \`${embedName}\` already exists. Please choose a unique name or use \`/embed edit\`.`, flags: [MessageFlags.Ephemeral] });
        }
    } else { // edit mode
        const existing = await db.query('SELECT embed_name FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [interaction.guildId, embedName]);
        if (existing.length === 0) {
            return interaction.reply({ content: `Could not find an embed named \`${embedName}\` to edit.`, flags: [MessageFlags.Ephemeral] });
        }
    }

    const token = uuidv4();
    if (!interaction.client.activeEmbedTokens) {
        interaction.client.activeEmbedTokens = new Map();
    }

    interaction.client.activeEmbedTokens.set(token, {
        user: interaction.user,
        guild: interaction.guild,
        embedName: embedName,
        mode: mode // 'create' or 'edit'
    });

    const EXPIRATION_MINUTES = 60;
    setTimeout(() => {
        if (interaction.client.activeEmbedTokens.has(token)) {
            logger.warn(`Embed Creator Token ${token} for ${interaction.user.tag} has expired.`);
            interaction.client.activeEmbedTokens.delete(token);
        }
    }, EXPIRATION_MINUTES * 60 * 1000);

    const formUrl = `http://${process.env.HOST_NAME}/embed/${token}`;
    const actionWord = mode === 'create' ? 'create' : 'edit';

    await interaction.reply({
        content: `Click the button below to ${actionWord} the **${embedName}** embed. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
        components: [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        label: 'Open Embed Editor',
                        style: 5, // Link Style
                        url: formUrl
                    }
                ]
            }
        ],
        flags: [MessageFlags.Ephemeral]
    });
}

async function handleSend(interaction, embedName) {
    const channel = interaction.options.getChannel('channel');

    const [embedRow] = await db.query('SELECT content, embed_data FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [interaction.guildId, embedName]);

    if (!embedRow) {
        return interaction.reply({ content: `Could not find a saved embed named \`${embedName}\`.`, flags: [MessageFlags.Ephemeral] });
    }

    try {
        const messagePayload = {};
        if (embedRow.content) {
            messagePayload.content = embedRow.content;
        }
        if (embedRow.embed_data) {
            // The data from the DB is already a JS object because of mysql2's parsing
            messagePayload.embeds = [embedRow.embed_data];
        }

        if (!messagePayload.content && (!messagePayload.embeds || messagePayload.embeds.length === 0 || Object.keys(messagePayload.embeds[0]).length === 0)) {
            return interaction.reply({ content: `The embed \`${embedName}\` is empty and cannot be sent.`, flags: [MessageFlags.Ephemeral] });
        }

        await channel.send(messagePayload);
        await interaction.reply({ content: `Embed \`${embedName}\` successfully sent to ${channel}.`, flags: [MessageFlags.Ephemeral] });
    } catch (error) {
        logger.error(`Failed to send saved embed ${embedName}:`, error);
        await interaction.reply({ content: `An error occurred while trying to send the embed: \`${error.message}\``, flags: [MessageFlags.Ephemeral] });
    }
}

async function handleList(interaction) {
    const embeds = await db.query('SELECT embed_name, creator_tag, updated_at FROM saved_embeds WHERE guild_id = ? ORDER BY embed_name ASC', [interaction.guildId]);

    if (embeds.length === 0) {
        return interaction.reply({ content: 'There are no saved embeds on this server.', flags: [MessageFlags.Ephemeral] });
    }

    const description = embeds.map(e => `🔹 \`${e.embed_name}\` (Last updated by ${e.creator_tag})`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('Saved Embeds')
        .setDescription(description.substring(0, 4000))
        .setColor(0x5865F2)
        .setFooter({ text: `Found ${embeds.length} embeds.` });

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

async function handleDelete(interaction, embedName) {
    const result = await db.query('DELETE FROM saved_embeds WHERE guild_id = ? AND embed_name = ?', [interaction.guildId, embedName]);

    if (result.affectedRows > 0) {
        await interaction.reply({ content: `Successfully deleted the embed named \`${embedName}\`.`, flags: [MessageFlags.Ephemeral] });
    } else {
        await interaction.reply({ content: `Could not find an embed named \`${embedName}\` to delete.`, flags: [MessageFlags.Ephemeral] });
    }
}

