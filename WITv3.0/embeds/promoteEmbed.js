const { EmbedBuilder } = require('discord.js');

/**
 * Builds a Discord embed for a promotion DM.
 * @param {string} targetRankName - The internal name of the rank the user was promoted to (e.g., 'line_commander').
 * @param {object} dmData - The configuration object for the DM, containing channelId and message.
 * @returns {EmbedBuilder} A configured EmbedBuilder instance.
 */
function buildPromotionEmbed(targetRankName, dmData) {
    const friendlyRankName = targetRankName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const promotionEmbed = new EmbedBuilder()
        .setColor('#57F287') // Green
        .setTitle('Congratulations on your promotion!')
        .setDescription(`You have been promoted to the rank of **${friendlyRankName}**.`)
        .addFields({ name: 'Next Steps', value: `${dmData.message}\n\nPlease visit the <#${dmData.channelId}> channel for more information.` })
        .setTimestamp();

    return promotionEmbed;
}

module.exports = { buildPromotionEmbed };
