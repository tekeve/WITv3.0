const { EmbedBuilder } = require('discord.js');
const db = require('@helpers/database');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');
const charManager = require('@helpers/characterManager');

const SIGNOFFS_REQUIRED = 2;
const DEMERITS_FOR_REMOVAL = 2;

/**
 * Fetches paginated and searchable data for the logi signoff form.
 * @param {object} options - Options for pagination and searching.
 * @returns {Promise<object>}
 */
async function getSignoffData(options = {}) {
    const {
        searchInProgress = '',
        searchTrusted = '',
        pageInProgress = 1,
        pageTrusted = 1,
        limit = 10
    } = options;

    const limitNum = Number(limit);
    const offsetInProgress = (Number(pageInProgress) - 1) * limitNum;
    const offsetTrusted = (Number(pageTrusted) - 1) * limitNum;
    const searchInProgressWildcard = `%${searchInProgress}%`;
    const searchTrustedWildcard = `%${searchTrusted}%`;

    try {
        const [inProgressCountResult] = await db.query('SELECT COUNT(*) as count FROM logi_signoffs WHERE pilot_name LIKE ? OR history LIKE ?', [searchInProgressWildcard, searchInProgressWildcard]);
        const [trustedCountResult] = await db.query('SELECT COUNT(*) as count FROM trusted_pilots WHERE pilot_name LIKE ? OR history LIKE ?', [searchTrustedWildcard, searchTrustedWildcard]);

        const totalInProgress = inProgressCountResult.count;
        const totalTrusted = trustedCountResult.count;

        // Use template literals for LIMIT and OFFSET to avoid placeholder issues with some mysql drivers
        const inProgress = await db.query(`SELECT id, pilot_name, history, created_at FROM logi_signoffs WHERE pilot_name LIKE ? OR history LIKE ? ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offsetInProgress}`, [searchInProgressWildcard, searchInProgressWildcard]);
        const trusted = await db.query(`SELECT pilot_name, added_at, history FROM trusted_pilots WHERE pilot_name LIKE ? OR history LIKE ? ORDER BY added_at DESC LIMIT ${limitNum} OFFSET ${offsetTrusted}`, [searchTrustedWildcard, searchTrustedWildcard]);

        const parseHistory = (pilot) => {
            try {
                pilot.history = pilot.history ? JSON.parse(pilot.history) : [];
                pilot.history.sort((a, b) => new Date(a.date) - new Date(b.date));
            } catch (e) {
                pilot.history = [];
            }
        };

        inProgress.forEach(parseHistory);
        trusted.forEach(parseHistory);

        return {
            inProgress: { pilots: inProgress, total: totalInProgress, page: pageInProgress, limit },
            trusted: { pilots: trusted, total: totalTrusted, page: pageTrusted, limit }
        };

    } catch (error) {
        logger.error('Failed to get paginated signoff data from database:', error);
        throw error;
    }
}


/**
 * Sends a notification to the council channel when a pilot passes signoffs.
 * @param {string} pilotName - The name of the pilot who passed.
 * @param {Array} history - The pilot's full history array.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
async function notifyCouncilOfPass(pilotName, history, client) {
    const config = configManager.get();
    const channelId = config.logiSignoffChannelId ? config.logiSignoffChannelId[0] : null;

    if (!channelId) {
        logger.warn('logiSignoffChannelId is not configured. Cannot send pass notification.');
        return;
    }

    try {
        const channel = await client.channels.fetch(channelId);
        const councilRoles = config.councilRoles || [];
        const roleMentions = councilRoles.map(id => `<@&${id}>`).join(' ');

        const historyString = history.map(h => {
            const typeEmoji = h.type === 'signoff' ? '✅' : (h.type === 'demerit' ? '❌' : '💬');
            const comment = h.comment ? `"${h.comment}"` : '*No comment*';
            return `${typeEmoji} **${h.commander}**: ${comment}`;
        }).join('\n');

        const finalHistoryString = historyString.length > 1024 ? historyString.substring(0, 1021) + '...' : historyString;

        const embed = new EmbedBuilder()
            .setColor(0x57F287) // Green
            .setTitle('✅ New Trusted Logistics Pilot')
            .setDescription(`**${pilotName}** has completed their logistics sign-offs and is now trusted.`)
            .addFields(
                { name: 'Full Sign-off History', value: finalHistoryString || 'No history recorded.' }
            )
            .setTimestamp();

        await channel.send({ content: roleMentions, embeds: [embed] });
        logger.success(`Sent pass notification for ${pilotName}.`);
    } catch (error) {
        logger.error('Failed to send pass notification:', error);
    }
}

/**
 * Adds a signoff for a pilot. If the pilot is new, they are created.
 * If they reach the required number of signoffs, they are promoted.
 * @param {string} pilotName - The name of the pilot being signed off.
 * @param {string} commanderName - The name of the commander giving the signoff.
 * @param {string} comment - The comment for the signoff.
 * @param {import('discord.js').Client} client - The Discord client.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addSignoff(pilotName, commanderName, comment, client) {
    try {
        const [isTrusted] = await db.query('SELECT 1 FROM trusted_pilots WHERE pilot_name = ?', [pilotName]);
        if (isTrusted) {
            return { success: false, message: `**${pilotName}** is already a trusted pilot.` };
        }

        const [pilot] = await db.query('SELECT * FROM logi_signoffs WHERE pilot_name = ?', [pilotName]);

        let currentHistory = pilot && pilot.history ? JSON.parse(pilot.history) : [];

        // Reset demerit count upon first new signoff after being demoted
        const demeritsInHistory = currentHistory.filter(h => h.type === 'demerit').length;
        if (demeritsInHistory >= DEMERITS_FOR_REMOVAL) {
            currentHistory.push({ type: 'comment', commander: 'System', comment: 'Pilot sign-off process restarted.', date: new Date().toISOString() });
        }

        const signoffsSinceLastDemerit = currentHistory.slice(
            (currentHistory.map(e => e.type).lastIndexOf('demerit') + 1)
        ).filter(h => h.type === 'signoff');

        if (signoffsSinceLastDemerit.some(s => s.commander === commanderName)) {
            return { success: false, message: `You have already signed off **${pilotName}** since their last demerit.` };
        }

        const newEvent = { type: 'signoff', commander: commanderName, comment, date: new Date().toISOString() };
        currentHistory.push(newEvent);

        if (pilot) {
            await db.query('UPDATE logi_signoffs SET history = ? WHERE id = ?', [JSON.stringify(currentHistory), pilot.id]);
        } else {
            await db.query('INSERT INTO logi_signoffs (pilot_name, history) VALUES (?, ?)', [pilotName, JSON.stringify(currentHistory)]);
        }

        const newSignoffCount = currentHistory.slice(
            (currentHistory.map(e => e.type).lastIndexOf('demerit') + 1)
        ).filter(h => h.type === 'signoff').length;

        if (newSignoffCount >= SIGNOFFS_REQUIRED) {
            await db.query('DELETE FROM logi_signoffs WHERE pilot_name = ?', [pilotName]);
            await db.query('INSERT INTO trusted_pilots (pilot_name, history) VALUES (?, ?)', [pilotName, JSON.stringify(currentHistory)]);
            await notifyCouncilOfPass(pilotName, currentHistory, client);
            return { success: true, message: `**${pilotName}** has been successfully signed off and is now a trusted pilot!` };
        } else {
            return { success: true, message: `Sign-off added for **${pilotName}**. They now have ${newSignoffCount}/${SIGNOFFS_REQUIRED} sign-offs.` };
        }
    } catch (error) {
        logger.error(`Error adding signoff for ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

/**
 * Adds a demerit for a trusted pilot. If it's the second demerit, the pilot is moved back to 'in_progress'.
 * @param {string} pilotName - The name of the pilot receiving the demerit.
 * @param {string} commanderName - The name of the commander giving the demerit.
 * @param {string} comment - The required comment for the demerit.
 * @param {import('discord.js').Client} client - The Discord client.
 * @returns {Promise<{success: boolean, message: string, demoted: boolean}>}
 */
async function addDemerit(pilotName, commanderName, comment, client) {
    try {
        const [pilot] = await db.query('SELECT history FROM trusted_pilots WHERE pilot_name = ?', [pilotName]);
        if (!pilot) {
            return { success: false, message: 'Could not find that trusted pilot.' };
        }

        let currentHistory = pilot.history ? JSON.parse(pilot.history) : [];

        // Reset signoff count upon first new demerit after being trusted
        const signoffsInHistory = currentHistory.filter(h => h.type === 'signoff').length;
        if (signoffsInHistory >= SIGNOFFS_REQUIRED) {
            currentHistory.push({ type: 'comment', commander: 'System', comment: 'Pilot demerit process started.', date: new Date().toISOString() });
        }

        const demeritsSinceLastSignoff = currentHistory.slice(
            (currentHistory.map(e => e.type).lastIndexOf('signoff') + 1)
        ).filter(h => h.type === 'demerit');

        if (demeritsSinceLastSignoff.some(d => d.commander === commanderName)) {
            return { success: false, message: `You have already given a demerit to **${pilotName}** since they were last trusted.` };
        }

        const newEvent = { type: 'demerit', commander: commanderName, comment, date: new Date().toISOString() };
        currentHistory.push(newEvent);

        const newDemeritCount = currentHistory.slice(
            (currentHistory.map(e => e.type).lastIndexOf('signoff') + 1)
        ).filter(h => h.type === 'demerit').length;

        if (newDemeritCount >= DEMERITS_FOR_REMOVAL) {
            await db.query('DELETE FROM trusted_pilots WHERE pilot_name = ?', [pilotName]);
            await db.query('INSERT INTO logi_signoffs (pilot_name, history) VALUES (?, ?)', [pilotName, JSON.stringify(currentHistory)]);
            await notifyCouncilOfDistrust(pilotName, currentHistory, client);
            return { success: true, message: `**${pilotName}** received a second demerit and has been moved back to the in-progress list.`, demoted: true };
        } else {
            await db.query('UPDATE trusted_pilots SET history = ? WHERE pilot_name = ?', [JSON.stringify(currentHistory), pilotName]);
            return { success: true, message: `Demerit added for **${pilotName}**. They now have ${newDemeritCount}/${DEMERITS_FOR_REMOVAL} demerits.`, demoted: false };
        }
    } catch (error) {
        logger.error(`Error adding demerit for ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

/**
 * Adds a positive comment to an already trusted pilot's history.
 * @param {string} pilotName - The name of the trusted pilot.
 * @param {string} commanderName - The name of the commander giving the comment.
 * @param {string} comment - The positive comment.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addTrustedComment(pilotName, commanderName, comment) {
    try {
        const [pilot] = await db.query('SELECT history FROM trusted_pilots WHERE pilot_name = ?', [pilotName]);
        if (!pilot) {
            return { success: false, message: 'Could not find that trusted pilot.' };
        }
        const currentHistory = pilot.history ? JSON.parse(pilot.history) : [];
        const newEvent = { type: 'comment', commander: commanderName, comment, date: new Date().toISOString() };
        currentHistory.push(newEvent);
        await db.query('UPDATE trusted_pilots SET history = ? WHERE pilot_name = ?', [JSON.stringify(currentHistory), pilotName]);
        return { success: true, message: `Comment added for **${pilotName}**.` };
    } catch (error) {
        logger.error(`Error adding trusted comment for ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

/**
 * Permanently deletes a pilot from either the in_progress or trusted list.
 * @param {string} pilotName The name of the pilot to delete.
 * @param {string} listType The list the pilot is on ('inProgress' or 'trusted').
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function deletePilot(pilotName, listType) {
    try {
        const tableName = listType === 'inProgress' ? 'logi_signoffs' : 'trusted_pilots';
        const result = await db.query(`DELETE FROM ${tableName} WHERE pilot_name = ?`, [pilotName]);

        if (result.affectedRows > 0) {
            logger.info(`Admin deleted pilot ${pilotName} from ${tableName}.`);
            return { success: true, message: `Successfully deleted ${pilotName}.` };
        } else {
            return { success: false, message: `Could not find ${pilotName} in the specified list to delete.` };
        }
    } catch (error) {
        logger.error(`Error deleting pilot ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred during deletion.' };
    }
}


/**
 * Sends a notification when a pilot is no longer trusted.
 * @param {string} pilotName - The name of the pilot.
 * @param {Array} history - The pilot's full history.
 * @param {import('discord.js').Client} client - The Discord client.
 */
async function notifyCouncilOfDistrust(pilotName, history, client) {
    const config = configManager.get();
    const channelId = config.logiSignoffChannelId ? config.logiSignoffChannelId[0] : null;

    if (!channelId) {
        logger.warn('logiSignoffChannelId is not configured. Cannot send distrust notification.');
        return;
    }

    try {
        const channel = await client.channels.fetch(channelId);
        const councilRoles = config.councilRoles || [];
        const roleMentions = councilRoles.map(id => `<@&${id}>`).join(' ');

        const historyString = history.map(h => {
            const typeEmoji = h.type === 'signoff' ? '✅' : (h.type === 'demerit' ? '❌' : '💬');
            const comment = h.comment ? `"${h.comment}"` : '*No comment*';
            return `${typeEmoji} **${h.commander}**: ${comment}`;
        }).join('\n');

        const finalHistoryString = historyString.length > 1024 ? historyString.substring(0, 1021) + '...' : historyString;

        const embed = new EmbedBuilder()
            .setColor(0xED4245) // Red
            .setTitle('❌ Logi Pilot No Longer Trusted')
            .setDescription(`**${pilotName}** has received two demerits and has been moved back to the in-progress list for re-evaluation.`)
            .addFields({ name: 'Full History', value: finalHistoryString || 'No history recorded.' })
            .setTimestamp();

        await channel.send({ content: roleMentions, embeds: [embed] });
        logger.success(`Sent distrust notification for ${pilotName}.`);
    } catch (error) {
        logger.error('Failed to send distrust notification:', error);
    }
}

/**
 * Validates a character name against ESI by proxying charManager.
 * @param {string} characterName The name of the character.
 * @returns {Promise<object|null>}
 */
async function validateCharacter(characterName) {
    return charManager.getCharacterDetails(characterName);
}

module.exports = {
    getSignoffData,
    addSignoff,
    addDemerit,
    addTrustedComment,
    deletePilot,
    validateCharacter
};

