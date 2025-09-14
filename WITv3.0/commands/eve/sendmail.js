const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const authManager = require('@helpers/authManager.js');
const roleManager = require('@helpers/roleManager');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendmail')
        .setDescription('Send an in-game EVE Mail via an authenticated character.')
        .addStringOption(option =>
            option.setName('mailing_list')
                .setDescription('The ID of the EVE mailing list to send to.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('subject')
                .setDescription('The subject line of the EVE mail.')
                .setRequired(true)),

    async execute(interaction) {
        // Use the centralized permission check
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
            });
        }

        // Auth Check
        const authData = await authManager.getUserAuthData(interaction.user.id);
        if (!authData) {
            return interaction.reply({
                content: 'You must authenticate a character with the `esi-mail.send_mail.v1` scope first. Use `/auth login`.',
            });
        }

        const mailingList = interaction.options.getString('mailing_list');
        const subject = interaction.options.getString('subject');

        // Generate a unique ID for this mail transaction to track it through the modal
        const mailId = crypto.randomBytes(8).toString('hex');

        // Store the full subject and mailing list temporarily in the client's in-memory store
        interaction.client.mailSubjects.set(mailId, { subject, mailingList });

        const modal = new ModalBuilder()
            // Use the unique ID in the customId so the handler can find it
            .setCustomId(`sendmail_modal_${mailId}`)
            // Truncate the title to avoid Discord API errors
            .setTitle(subject.substring(0, 45));

        const mailBodyInput = new TextInputBuilder()
            .setCustomId('mail_body')
            .setLabel("Mail Body")
            .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder().addComponents(mailBodyInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },
};

