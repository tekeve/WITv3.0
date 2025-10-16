const { MessageFlags, ThreadAutoArchiveDuration, ChannelType } = require('discord.js');
const logger = require('@helpers/logger');
const { buildSrpDetailsEmbed, buildSrpItemsEmbed } = require('@embeds/srpEmbed.js');
const configManager = require('@helpers/configManager');
const authManager = require('@helpers/authManager'); // For ESI authentication
const esiService = require('@helpers/esiService');   // For making ESI calls
const charManager = require('@helpers/characterManager');

/**
 * Formats an ISK value for EVE mail.
 * @param {number} value The ISK value.
 * @returns {string} The formatted string.
 */
function formatIskForMail(value) {
    return new Intl.NumberFormat('en-US').format(value || 0);
}

/**
 * Formats the form data into a clean text body for an EVE mail.
 * @param {object} formData - The data collected from the web form.
 * @param {string} submitterName - The in-game name of the person who ran the /srp command.
 * @param {object} processedKillmail - The processed killmail data from srpManager.
 * @returns {string} The formatted EVE mail body.
 */
function formatEveMailBody(formData, submitterName, processedKillmail) {
    const backseatDetails = formData.backseat_info === 'Other'
        ? `Other: ${formData.backseat_other_details || 'N/A'}`
        : formData.backseat_info;

    let report_link = 'Not Provided';
    if (formData.kill_report_option === 'link' && formData.kill_report_link) {
        const match = formData.kill_report_link.match(/killmails\/(\d+)\/([a-f0-9]+)\//);
        if (match) {
            const killmail_id = match[1];
            const killmail_hash = match[2];
            report_link = `<url=killReport:${killmail_id}:${killmail_hash}>Kill: ${formData.pilot_name} (${formData.ship_type})</url>`;
        } else {
            report_link = formData.kill_report_link;
        }
    }

    let itemsList = '';
    if (processedKillmail) {
        const { victim, items } = processedKillmail;
        itemsList += `\n<b>Destroyed Items:</b>\n`;
        itemsList += `- ${victim.shipTypeName} - ${formatIskForMail(victim.shipValue)} ISK\n`;
        items.destroyed.forEach(item => {
            itemsList += `- ${item.quantity.toLocaleString()}x ${item.name} - ${formatIskForMail(item.value)} ISK\n`;
        });
    }

    return `
SRP Request Details
-------------------
<b>Pilot Name:</b> ${formData.pilot_name}
<b>Ship Lost:</b> ${formData.ship_type}
<b>Calculated Value:</b> ${formatIskForMail(processedKillmail ? processedKillmail.totalValue : formData.kill_value)} ISK

<b>FC Name:</b> ${formData.fc_name}
<b>FC Status:</b> ${backseatDetails}

<b>Kill Report Link:</b> ${report_link}
${itemsList}
<b>Loss Description (AAR):</b>
${formData.loss_description || 'No description provided.'}

<b>Loot Status:</b>
${formData.loot_status || 'N/A'}
-------------------
Submitted via Discord by: ${submitterName}
    `.trim();
}

module.exports = {
    name: 'srpSubmission',
    async execute(payload, client) {
        logger.info(`Processing srpSubmission event for user ${payload.user.tag}`);
        const { interaction, user, formData, processedKillmail } = payload;
        const config = configManager.get();

        try {
            // --- Post to Discord Channel ---
            const srpChannelId = config.srpChannelId ? config.srpChannelId[0] : null;
            if (!srpChannelId) {
                logger.error("srpChannelId is not configured in the database.");
            } else {
                const srpChannel = await client.channels.fetch(srpChannelId);
                if (srpChannel && (srpChannel.type === ChannelType.GuildText || srpChannel.type === ChannelType.GuildAnnouncement)) {
                    const thread = await srpChannel.threads.create({
                        name: `SRP: ${formData.pilot_name} - ${formData.ship_type}`,
                        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                        reason: `New SRP request for ${formData.pilot_name}`,
                    });

                    // Build both embeds
                    const detailsEmbed = await buildSrpDetailsEmbed(payload);
                    const itemEmbeds = await buildSrpItemsEmbed(payload); // This returns an array

                    // Combine them and send
                    const allEmbeds = [detailsEmbed, ...itemEmbeds];
                    await thread.send({ embeds: allEmbeds });

                } else {
                    logger.error(`Could not find the SRP channel with ID: ${srpChannelId} or it's not a text-based channel.`);
                }
            }

            // --- Send EVE Mail ---
            const srpMailingListId = config.srpMailingListId ? config.srpMailingListId[0] : null;
            if (!srpMailingListId) {
                logger.warn('srpMailingListId is not configured in the database. Skipping EVE mail.');
            } else {
                const authData = await authManager.getUserAuthData(user.id);
                if (!authData) {
                    logger.warn(`User ${user.tag} submitted an SRP but does not have an authenticated mailing character. Cannot send EVE mail.`);
                } else {
                    try {
                        const accessToken = await authManager.getAccessToken(user.id);
                        const submitterCharData = await charManager.getChars(user.id);
                        const submitterName = submitterCharData?.main?.character_name || user.tag;

                        const mailSubject = `SRP Request: ${formData.pilot_name} - ${formData.ship_type}`;
                        const mailBody = formatEveMailBody(formData, submitterName, processedKillmail);

                        await esiService.post({
                            endpoint: `/characters/${authData.character_id}/mail/`,
                            data: {
                                approved_cost: 0,
                                body: mailBody,
                                recipients: [{
                                    recipient_id: parseInt(srpMailingListId, 10),
                                    recipient_type: 'mailing_list'
                                }],
                                subject: mailSubject,
                            },
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            caller: __filename
                        });
                        logger.success(`Successfully sent SRP EVE mail for ${formData.pilot_name} from ${authData.character_name}.`);
                    } catch (esiError) {
                        logger.error('Failed to send SRP EVE mail via ESI:', esiError);
                    }
                }
            }

            // --- Final Confirmation to User ---
            await interaction.followUp({
                content: 'Your SRP request has been successfully submitted and a thread has been created!',
                flags: [MessageFlags.Ephemeral]
            });

        } catch (error) {
            logger.error('Failed to process srpSubmission event:', error);
            try {
                await interaction.followUp({
                    content: 'Your SRP was submitted, but a critical error occurred while posting to Discord.',
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (followUpError) {
                logger.error('Failed to send follow-up error message:', followUpError);
            }
        }
    }
};

