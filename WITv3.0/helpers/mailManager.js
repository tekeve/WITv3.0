const { MessageFlags } = require('discord.js');
const esi = require('@helpers/esiService'); // Use the new ESI service
const logger = require('@helpers/logger');
const authManager = require('@helpers/authManager');
const db = require('@helpers/database');

async function handleModal(interaction) {
    const { customId, client } = interaction;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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
        if (!accessToken) {
            return interaction.editReply({ content: 'Could not retrieve a valid access token. Please try to `/auth login` again.' });
        }

        const recipientId = parseInt(mailData.mailingList, 10);
        if (isNaN(recipientId)) {
            return interaction.editReply({ content: 'Error: The mailing list ID must be a number.' });
        }

        const recipient = {
            recipient_id: recipientId,
            recipient_type: 'mailing_list'
        };

        // Send the mail via ESI
        await esi.post({
            endpoint: `/characters/${authData.character_id}/mail/`,
            data: {
                approved_cost: 0,
                body: mailBody,
                recipients: [recipient],
                subject: mailData.subject,
            },
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            caller: __filename
        });
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

/**
 * Saves a failed EVE mail to the database queue.
 * @param {string} discordId - The Discord ID of the sender.
 * @param {number} mailingListId - The ID of the mailing list.
 * @param {string} subject - The mail subject.
 * @param {string} body - The mail body.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
async function queueFailedMail(discordId, mailingListId, subject, body) {
    try {
        const sql = 'INSERT INTO mail_queue (sender_discord_id, mailing_list_id, subject, body) VALUES (?, ?, ?, ?)';
        await db.query(sql, [discordId, mailingListId, subject, body]);
        logger.info(`Queued failed mail for user ${discordId} to mailing list ${mailingListId}.`);
        return true;
    } catch (error) {
        logger.error('Failed to queue EVE mail to database:', error);
        return false;
    }
}

/**
 * Handles the logic for the /sendmail retry command.
 * @param {import('discord.js').Interaction} interaction The interaction object.
 */
async function handleRetryCommand(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
        const queuedMails = await db.query('SELECT * FROM mail_queue');
        if (queuedMails.length === 0) {
            return interaction.editReply('The mail queue is empty. No mails to retry.');
        }

        let successCount = 0;
        let failCount = 0;

        for (const mail of queuedMails) {
            const authData = await authManager.getUserAuthData(mail.sender_discord_id);
            if (!authData) {
                failCount++;
                logger.warn(`Skipping queued mail ID ${mail.id} because sender ${mail.sender_discord_id} is no longer authenticated.`);
                continue;
            }

            try {
                const accessToken = await authManager.getAccessToken(mail.sender_discord_id);
                if (!accessToken) {
                    failCount++;
                    logger.warn(`Skipping queued mail ID ${mail.id} due to inability to get a valid access token for ${mail.sender_discord_id}.`);
                    continue;
                }

                await esi.post({
                    endpoint: `/characters/${authData.character_id}/mail/`,
                    data: {
                        approved_cost: 0,
                        body: mail.body,
                        recipients: [{
                            recipient_id: mail.mailing_list_id,
                            recipient_type: 'mailing_list'
                        }],
                        subject: mail.subject,
                    },
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    caller: __filename
                });

                // If successful, delete from queue
                await db.query('DELETE FROM mail_queue WHERE id = ?', [mail.id]);
                successCount++;
                logger.success(`Successfully sent queued mail ID ${mail.id}.`);

            } catch (esiError) {
                failCount++;
                const errorMessage = esiError.response ? JSON.stringify(esiError.response.data) : esiError.message;
                logger.error(`Failed to resend queued mail ID ${mail.id}. ESI Error: ${errorMessage}`);
            }
        }

        await interaction.editReply(`Mail queue retry complete.\n- **Successfully sent:** ${successCount}\n- **Failed to send:** ${failCount}`);

    } catch (dbError) {
        logger.error('Error processing mail queue:', dbError);
        await interaction.editReply('A database error occurred while trying to process the mail queue.');
    }
}

module.exports = {
    handleModal,
    queueFailedMail,
    handleRetryCommand,
};
