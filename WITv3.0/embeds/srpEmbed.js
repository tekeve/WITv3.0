const { EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');

/**
 * Builds a Discord embed for an SRP request from web form data.
 * @param {object} payload The data payload from the srpSubmission event.
 * @param {object} payload.user The user who initiated the command.
 * @param {object} payload.formData The data collected from the web form.
 * @returns {Promise<EmbedBuilder>} A promise that resolves to the configured EmbedBuilder instance.
 */
async function buildSrpEmbed(payload) {
    const { user, formData } = payload;

    // Determine who submitted the request
    const submitterCharData = await charManager.getChars(user.id);
    const submitterName = submitterCharData ? submitterCharData.main_character : user.tag;

    // Format the kill report link for the embed
    let killReportValue = 'Not Provided';
    if (formData.kill_report_option === 'link' && formData.kill_report_link) {
        const match = formData.kill_report_link.match(/killmails\/(\d+)\/([a-f0-9]+)\//);
        if (match) {
            const killmailId = match[1];
            killReportValue = `[zKillboard Link](https://zkillboard.com/kill/${killmailId}/)`;
        } else {
            killReportValue = 'Invalid ESI Link Format';
        }
    }

    // Combine backseat info if 'Other' was selected
    const backseatDetails = formData.backseat_info === 'Other'
        ? `Other: ${formData.backseat_other_details || 'N/A'}`
        : formData.backseat_info;

    // Format ISK value to be more readable
    const formattedValue = new Intl.NumberFormat('en-US').format(formData.kill_value);

    const srpEmbed = new EmbedBuilder()
        .setColor(0x3498DB) // A nice blue color
        .setAuthor({ name: `Submitted by: ${submitterName}`, iconURL: user.displayAvatarURL() })
        .setTitle(`SRP Request: ${formData.pilot_name}`)
        .setDescription(formData.loss_description || '*No description provided.*')
        .addFields(
            { name: 'Pilot Name', value: formData.pilot_name, inline: true },
            { name: 'Ship Lost', value: formData.ship_type, inline: true },
            { name: 'ISK Value', value: `${formattedValue} ISK`, inline: true },
            { name: 'FC Name', value: formData.fc_name, inline: true },
            { name: 'Backseat Info', value: backseatDetails, inline: true },
            { name: 'Kill Report', value: killReportValue, inline: true },
            { name: 'SRPable?', value: formData.srpable, inline: true },
            { name: 'SRP Paid?', value: formData.srp_paid, inline: true },
            { name: '\u200B', value: '\u200B', inline: true }, // Spacer
            { name: 'Loot Status', value: formData.loot_status || 'N/A', inline: false }
        )
        .setFooter({ text: 'Web Form Submission' })
        .setTimestamp();

    return srpEmbed;
}

module.exports = { buildSrpEmbed };
