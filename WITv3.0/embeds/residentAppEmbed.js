const { EmbedBuilder } = require('discord.js');

/**
 * Builds a Discord embed for a resident application request from web form data.
 * @param {object} payload The data payload from the residentAppSubmission event.
 * @param {object} payload.user The user who initiated the command.
 * @param {object} payload.formData The data collected from the web form.
 * @returns {EmbedBuilder} A configured EmbedBuilder instance.
 */
function buildResidentAppEmbed(payload) {
    const { user, formData } = payload;

    const formatShips = (ships) => {
        if (!ships || ships.length === 0 || ships.includes('None')) return 'None';
        return Array.isArray(ships) ? ships.join('\n') : ships;
    };

    // Handle the alts array from the new form input
    const submittedAlts = formData['alts[]'];
    const altsValue = (submittedAlts && Array.isArray(submittedAlts) && submittedAlts.length > 0)
        ? submittedAlts.join('\n')
        : 'None';

    const residentAppEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`New Resident Application: ${formData.character_name}`)
        .setAuthor({ name: `Submitted by: ${user.tag}`, iconURL: user.displayAvatarURL() })
        .setDescription('\u200B')
        .addFields(
            { name: 'Character Name', value: formData.character_name || 'N/A', inline: true },
            { name: 'Alts', value: altsValue, inline: true },
            { name: 'Time with WTM', value: formData.wtm_time || 'N/A', inline: true },
            { name: 'Forum Identity', value: formData.forum_identity || 'N/A', inline: true },
            { name: 'Discord Identity', value: formData.discord_identity || 'N/A', inline: true },
            { name: 'T2 Guns?', value: formData.t2_guns || 'N/A', inline: true },
            { name: 'Logistics Ships', value: formatShips(formData.logistics_ships), inline: true },
            { name: '\u200B', value: '\u200B', inline: true }, // Spacer
            { name: 'Battleships', value: formatShips(formData.battleship_ships), inline: true },
            { name: 'Time Commitment', value: formData.command_time_estimate || 'N/A', inline: true }
        )
        .setFooter({ text: 'Web Form Submission | Long answers in message below' })
        .setTimestamp();

    return residentAppEmbed;
}

module.exports = { buildResidentAppEmbed };

