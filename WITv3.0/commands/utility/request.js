const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    permissions: ['commander'],
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Opens a form to submit a request ticket.'),

    async execute(interaction) {
        // Create the modal (pop-up form)
        const modal = new ModalBuilder()
            .setCustomId('request_modal')
            .setTitle('Submit a New Request');

        // Create the text input component for the modal
        const detailsInput = new TextInputBuilder()
            .setCustomId('request_details_input')
            .setLabel("Please describe your request in detail")
            // Use Paragraph style to allow multi-line input
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('You can use Shift+Enter here to create new lines and format your request.')
            .setRequired(true);

        // A modal needs an action row to hold the text input
        const actionRow = new ActionRowBuilder().addComponents(detailsInput);

        // Add the input to the modal
        modal.addComponents(actionRow);

        // Show the modal to the user
        await interaction.showModal(modal);
    },
};
