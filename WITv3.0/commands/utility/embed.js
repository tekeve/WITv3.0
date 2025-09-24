const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const db = require('@helpers/database');

/**
 * Handles the logic for the /embed create and /embed edit subcommands.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleCreateEdit(interaction) {
    const embedName = interaction.options.getString('name'); // This is null for 'create'
    const guild = interaction.guild;

    // For the 'edit' command, we must first verify the embed exists in this guild.
    if (embedName) {
        const existing = await db.query('SELECT embed_name FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, guild.id]);
        if (existing.length === 0) {
            return interaction.reply({
                content: `An embed named \`${embedName}\` was not found in this server.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    const token = uuidv4();

    // Store token with necessary context.
    interaction.client.activeEmbedTokens.set(token, {
        user: interaction.user,
        guild: interaction.guild,
        guildId: interaction.guild.id, // Storing guildId directly
        embedName: embedName // Will be null for 'create', or the name for 'edit'
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
    const actionWord = embedName ? 'edit' : 'create';

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
                .setDescription('Opens the web creator to build a new embed.'))
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
                .setDescription('Deletes a saved embed.')
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
            await interaction.deferReply({ ephemeral: true });
            const embedName = interaction.options.getString('name');
            const channel = interaction.options.getChannel('channel');
            const messageContent = interaction.options.getString('message_content');

            const result = await db.query('SELECT embed_data FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, interaction.guild.id]);

            if (result.length === 0) {
                return interaction.editReply(`Could not find an embed named \`${embedName}\`.`);
            }

            try {
                const embedData = JSON.parse(result[0].embed_data);
                const embedToSend = new EmbedBuilder(embedData);
                await channel.send({ content: messageContent, embeds: [embedToSend] });
                await interaction.editReply(`✅ Embed \`${embedName}\` has been sent to ${channel}.`);
            } catch (error) {
                logger.error(`Failed to send embed "${embedName}":`, error);
                await interaction.editReply('There was an error parsing or sending the embed.');
            }
        } else if (subcommand === 'list') {
            await interaction.deferReply({ ephemeral: true });
            const embeds = await db.query('SELECT embed_name, created_by_tag, last_edited_at FROM saved_embeds WHERE guild_id = ? ORDER BY embed_name', [interaction.guild.id]);

            if (embeds.length === 0) {
                return interaction.editReply('There are no saved embeds for this server.');
            }

            const description = embeds.map(e => `🔹 **${e.embed_name}** (Last edited: <t:${Math.floor(new Date(e.last_edited_at).getTime() / 1000)}:R>)`).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Saved Embeds')
                .setDescription(description)
                .setColor(0x5865F2)
                .setFooter({ text: `Found ${embeds.length} embeds.` });

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === 'delete') {
            const embedName = interaction.options.getString('name');
            const result = await db.query('DELETE FROM saved_embeds WHERE embed_name = ? AND guild_id = ?', [embedName, interaction.guild.id]);

            if (result.affectedRows > 0) {
                await interaction.reply({ content: `✅ Successfully deleted the embed named \`${embedName}\`.`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Could not find an embed named \`${embedName}\` to delete.`, ephemeral: true });
            }
        }
    },
};

