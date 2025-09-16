const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');
const configManager = require('@helpers/configManager'); // Import config manager

async function handleTicketButton(interaction) {
    // Permission check
    if (!roleManager.isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to resolve tickets.' });
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

async function handleResolveModal(interaction) {
    const { customId, client } = interaction;
    const config = configManager.get(); // Get the latest config
    const [, , messageId, action] = customId.split('_');
    const closingComment = interaction.fields.getTextInputValue('resolve_comment');

    if (!config.requestChannelId || !config.archiveChannelId) {
        logger.error('requestChannelId or archiveChannelId is not configured in the database.');
        return interaction.reply({ content: 'Error: Request system channels are not configured.' });
    }

    try {
        const resolverCharData = await charManager.getChars(interaction.user.id);
        const resolverName = resolverCharData ? resolverCharData.main_character : interaction.user.tag;

        const requestChannel = await client.channels.fetch(config.requestChannelId);
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

        const archiveChannel = await client.channels.fetch(config.archiveChannelId);
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
        await handleResolveModal(interaction);
    }
}

module.exports = { handleInteraction };
