const axios = require('axios');
const logger = require('@helpers/logger');
const authManager = require('@helpers/authManager');

async function handleModal(interaction) {
    const { customId, client } = interaction;

    await interaction.deferReply();

    // Extract the unique mail ID from the modal's custom ID
    const mailId = customId.substring('sendmail_modal_'.length);
    const mailData = client.mailSubjects.get(mailId);
    if (!mailData) {
        return interaction.editReply({ content: 'Error: Could not retrieve mail data. It may have expired. Please try again.' });
    }

    const mailBody = interaction.fields.getTextInputValue('mail_body');
    const authData = await authManager.getUserAuthData(interaction.user.id);

    if (!authData) {
        return interaction.editReply({ content: 'Your authentication has expired. Please `/auth login` again.' });
    }

    try {
        const accessToken = await authManager.getAccessToken(interaction.user.id);
        const recipientId = parseInt(mailData.mailingList, 10);
        if (isNaN(recipientId)) {
            return interaction.editReply({ content: 'Error: The mailing list ID must be a number.' });
        }

        const recipient = {
            recipient_id: recipientId,
            recipient_type: 'mailing_list'
        };

        // Send the mail via ESI
        await axios.post(
            `https://esi.evetech.net/latest/characters/${authData.character_id}/mail/`,
            {
                approved_cost: 0,
                body: mailBody,
                recipients: [recipient],
                subject: mailData.subject,
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        await interaction.editReply({ content: 'EVE Mail has been sent successfully!' });
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error('Failed to send EVE mail:', errorMessage);
        await interaction.editReply({ content: `Failed to send EVE mail. ESI responded with: \`${errorMessage}\`` });
    } finally {
        // Clean up the temporary mail data
        client.mailSubjects.delete(mailId);
    }
}

module.exports = { handleModal };
