const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const authManager = require('../../helpers/authManager.js');
const { adminRoles } = require('../../config.js');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendmail')
        .setDescription('Admin only: Send an in-game EVE Mail via an authenticated character.')
        .addStringOption(option =>
            option.setName('mailing_list')
                .setDescription('The ID of the EVE mailing list to send to.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('subject')
                .setDescription('The subject line of the EVE mail.')
                .setRequired(true)),

    async execute(interaction) {
        // Permission Check
        if (!interaction.member.roles.cache.some(role => adminRoles.includes(role.name))) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Auth Check
        const authData = authManager.getUserAuthData(interaction.user.id);
        if (!authData) {
            return interaction.reply({
                content: 'You must authenticate a character with the `esi-mail.send_mail.v1` scope first. Use `/auth login`.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const mailingList = interaction.options.getString('mailing_list');
        const subject = interaction.options.getString('subject');

        // Generate a unique ID for this mail transaction
        const mailId = crypto.randomBytes(8).toString('hex');

        // Store the full subject and mailing list temporarily
        interaction.client.mailSubjects.set(mailId, { subject, mailingList });

        const modal = new ModalBuilder()
            // Use the unique ID in the customId
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

