const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');
const configManager = require('@helpers/configManager');

async function handleTicketButton(interaction) {
    // Permission check
    if (!roleManager.isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to resolve tickets.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setTitle('Resolve Request Ticket');
    const action = interaction.customId === 'ticket_solve' ? 'Solved' : 'Denied';
    modal.setCustomId(`resolve_modal_${interaction.message.id}_${action}`);

    const commentInput = new TextInputBuilder()
        .setCustomId('resolve_comment')
        .setLabel('Closing Comment')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your reason...')
        .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(commentInput);
    modal.addComponents(actionRow);
    await interaction.showModal(modal);
}

async function handleRequestModal(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const config = configManager.get();
    const requestChannelId = config.requestChannelId ? config.requestChannelId[0] : null;

    if (!requestChannelId) {
        logger.error('requestChannelId is not configured in the database.');
        return interaction.editReply({ content: 'Error: The request channel is not configured correctly.' });
    }

    const requestDetails = interaction.fields.getTextInputValue('request_details_input');
    const requester = interaction.user;

    const charData = await charManager.getChars(requester.id);
    let authorName = charData?.main?.character_name || requester.username;

    const authorObject = { name: authorName };
    const authorIcon = requester.displayAvatarURL();
    if (authorIcon) {
        authorObject.iconURL = authorIcon;
    }

    const requestChannel = await interaction.client.channels.fetch(requestChannelId);
    if (!requestChannel) {
        return interaction.editReply({ content: 'Error: The request channel could not be found.' });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const embed = new EmbedBuilder()
        .setColor(0xFFA500) // Orange for 'Open'
        .setTitle('New Request Ticket')
        .setAuthor(authorObject)
        .setDescription(requestDetails)
        .addFields(
            { name: 'Status', value: 'Open', inline: true },
            { name: 'Created On', value: `<t:${timestamp}:f>`, inline: true }
        );

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_solve')
                .setLabel('Solve')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('ticket_deny')
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    await requestChannel.send({ embeds: [embed], components: [buttons] });
    await interaction.editReply({ content: 'Your request has been submitted successfully!' });
}

async function handleResolveModal(interaction) {
    const { customId, client } = interaction;
    const config = configManager.get(); // Get the latest config
    const [, , messageId, action] = customId.split('_');
    const closingComment = interaction.fields.getTextInputValue('resolve_comment');

    if (!config.requestChannelId || !config.archiveChannelId) {
        logger.error('requestChannelId or archiveChannelId is not configured in the database.');
        return interaction.reply({ content: 'Error: Request system channels are not configured.', flags: [MessageFlags.Ephemeral] });
    }

    try {
        const resolverCharData = await charManager.getChars(interaction.user.id);
        const resolverName = resolverCharData?.main?.character_name || interaction.user.tag;

        const requestChannel = await client.channels.fetch(config.requestChannelId[0]); // Channels are arrays now
        const originalMessage = await requestChannel.messages.fetch(messageId);
        const originalEmbed = originalMessage.embeds[0];

        const createdOnField = originalEmbed.fields.find(field => field.name === 'Created On');
        const createdOnValue = createdOnField ? createdOnField.value : 'N/A';
        const resolvedTimestamp = Math.floor(Date.now() / 1000);

        const archiveEmbed = new EmbedBuilder()
            .setColor(action === 'Solved' ? 0x3BA55D : 0xED4245)
            .setTitle(`Request ${action}`)
            .setAuthor(originalEmbed.author)
            .setDescription(originalEmbed.description)
            .addFields(
                { name: 'Status', value: action, inline: true },
                { name: 'Resolved By', value: resolverName, inline: true },
                { name: 'Closing Comment', value: closingComment, inline: false },
                { name: 'Created On', value: createdOnValue, inline: true },
                { name: 'Resolved On', value: `<t:${resolvedTimestamp}:f>`, inline: true }
            );

        const archiveChannel = await client.channels.fetch(config.archiveChannelId[0]);
        await archiveChannel.send({ embeds: [archiveEmbed] });
        await originalMessage.delete();

        await interaction.reply({ content: 'The ticket has been successfully archived.', flags: [MessageFlags.Ephemeral] });
    } catch (error) {
        logger.error('Error processing ticket resolution:', error);
        await interaction.reply({ content: 'There was an error resolving this ticket.' });
    }
}

async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        await handleTicketButton(interaction);
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('resolve_modal_')) {
            await handleResolveModal(interaction);
        } else if (interaction.customId === 'request_modal') {
            await handleRequestModal(interaction);
        }
    }
}

module.exports = { handleInteraction };

