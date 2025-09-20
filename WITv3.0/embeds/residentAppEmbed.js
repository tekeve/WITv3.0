const { EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');

async function buildResidentAppEmbed(payload) {
    const { user, formData } = payload;

    const submitterCharData = await charManager.getChars(user.id);
    const submitterName = submitterCharData?.main?.character_name || user.tag;

    const appEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`New Resident Application: ${formData.character_name}`)
        .setAuthor({ name: `Submitted by: ${submitterName}`, iconURL: user.displayAvatarURL() })
        .addFields(
            { name: 'Character Name', value: formData.character_name, inline: true },
            { name: 'Alts', value: formData.alts || 'N/A', inline: true },
            { name: 'Forum Identity', value: formData.forum_identity, inline: true },
            { name: 'Discord Identity', value: formData.discord_identity, inline: true },
            { name: 'Time with WTM', value: formData.wtm_time, inline: true },
            { name: 'T2 Guns?', value: formData.t2_guns, inline: true }
        )
        .setFooter({ text: 'Web Form Submission | Long answers in message below' })
        .setTimestamp();

    return appEmbed;
}

module.exports = { buildResidentAppEmbed };

