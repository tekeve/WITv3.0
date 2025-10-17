const { EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');

/**
 * Splits an array of text lines into chunks that will fit in an embed description.
 * @param {string[]} lines - Array of strings to chunk.
 * @param {number} [maxLength=4096] - The maximum length of each chunk.
 * @returns {string[]} An array of string chunks.
 */
function chunkLines(lines, maxLength = 4096) {
    const chunks = [];
    let currentChunk = '';
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}


/**
 * Formats an ISK value into a full, readable string with commas.
 * @param {number} value - The ISK value.
 * @returns {string} The formatted string (e.g., "1,234,567,890 ISK").
 */
function formatIskFull(value) {
    if (value === null || value === undefined || isNaN(value)) return '0 ISK';
    return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })} ISK`;
}


/**
 * Builds the main Discord embed for an SRP request from web form data.
 * @param {object} payload The data payload from the srpSubmission event.
 * @returns {Promise<EmbedBuilder>} A promise that resolves to the configured EmbedBuilder instance.
 */
async function buildSrpDetailsEmbed(payload) {
    const { user, formData, processedKillmail } = payload;
    const submitterCharData = await charManager.getChars(user.id);
    const submitterName = submitterCharData?.main?.character_name || user.tag;

    let killReportValue = 'Not Provided';
    if (processedKillmail) {
        const esiLink = `https://esi.evetech.net/latest/killmails/${processedKillmail.killmailId}/${processedKillmail.killmailHash}/`;
        const zkillLink = `https://zkillboard.com/kill/${processedKillmail.killmailId}/`;
        killReportValue = `[ESI Link](${esiLink}) | [zKillboard](${zkillLink})`;
    } else if (formData.kill_report_option === 'link' && formData.kill_report_link) {
        // Fallback for when ESI processing fails but a link was given
        const match = formData.kill_report_link.match(/killmails\/(\d+)\//);
        if (match) {
            const killmailId = match[1];
            const zkillLink = `https://zkillboard.com/kill/${killmailId}/`;
            killReportValue = `[Provided ESI Link](${formData.kill_report_link}) | [zKillboard](${zkillLink})`;
        } else {
            killReportValue = `[Provided Link](${formData.kill_report_link})`;
        }
    }


    const backseatDetails = formData.backseat_info === 'Other'
        ? `Other: ${formData.backseat_other_details || 'N/A'}`
        : formData.backseat_info;

    // Use the new full formatting for the value
    const calculatedValue = formatIskFull(processedKillmail ? processedKillmail.totalValue : formData.kill_value);

    const srpEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setAuthor({ name: `Submitted by: ${submitterName}`, iconURL: user.displayAvatarURL() })
        .setTitle(`SRP Request: ${formData.pilot_name}`)
        .setDescription(formData.loss_description || '*No description provided.*')
        .addFields(
            { name: 'Pilot Name', value: formData.pilot_name, inline: true },
            { name: 'Ship Lost', value: formData.ship_type, inline: true },
            { name: 'Calculated Value', value: `**${calculatedValue}**`, inline: true },
            { name: 'FC Name', value: formData.fc_name, inline: true },
            { name: 'FC Status', value: backseatDetails, inline: true },
            { name: 'Killmail Links', value: killReportValue, inline: true },
            { name: 'SRPable?', value: formData.srpable, inline: true },
            { name: 'SRP Paid?', value: formData.srp_paid, inline: true },
            { name: '\u200B', value: '\u200B', inline: true }, // Spacer
            { name: 'Loot Status', value: formData.loot_status || 'N/A', inline: false }
        )
        .setFooter({ text: 'Web Form Submission' })
        .setTimestamp();

    if (processedKillmail && processedKillmail.victim.shipTypeId) {
        srpEmbed.setThumbnail(`https://images.evetech.net/types/${processedKillmail.victim.shipTypeId}/render?size=64`);
    }

    return srpEmbed;
}

/**
 * Builds one or more embeds listing the destroyed items from a killmail.
 * @param {object} payload The data payload from the srpSubmission event.
 * @returns {Promise<EmbedBuilder[]>} A promise that resolves to an array of configured EmbedBuilder instances.
 */
async function buildSrpItemsEmbed(payload) {
    const { processedKillmail } = payload;
    if (!processedKillmail || !processedKillmail.items || !processedKillmail.victim) {
        return [];
    }

    const { victim, items } = processedKillmail;
    const destroyedModules = items.destroyed || [];
    const embeds = [];

    const allDestroyed = [
        {
            typeId: victim.shipTypeId,
            name: victim.shipTypeName,
            quantity: 1,
            value: victim.shipValue
        },
        ...destroyedModules
    ];

    const sortedItems = allDestroyed.sort((a, b) => b.value - a.value);

    const itemLines = sortedItems.map(item => {
        const quantityString = item.quantity > 1 ? `\`${item.quantity.toLocaleString()}x\` ` : '';
        // Reverted to plain text without icons
        return `${quantityString}${item.name} - **${formatIskFull(item.value)}**`;
    });

    if (itemLines.length === 0) {
        return [];
    }

    // Chunk the lines into separate descriptions for multiple embeds if needed
    const itemChunks = chunkLines(itemLines, 4000); // Use a smaller chunk size for descriptions

    itemChunks.forEach((chunk, index) => {
        const itemsEmbed = new EmbedBuilder()
            .setColor(0x2C2F33) // A neutral dark color
            .setDescription(chunk);

        if (index === 0) {
            itemsEmbed.setAuthor({ name: 'Destroyed Items & Hull' });
        } else {
            itemsEmbed.setAuthor({ name: '(Destroyed Items Continued)' });
        }

        embeds.push(itemsEmbed);
    });

    return embeds;
}


module.exports = { buildSrpDetailsEmbed, buildSrpItemsEmbed };

