const { EmbedBuilder, ChannelType, ThreadAutoArchiveDuration } = require('discord.js');
const logger = require('@helpers/logger');
const { buildResidentAppEmbed } = require('@embeds/residentAppEmbed.js');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database');
const charManager = require('@helpers/characterManager');

/**
 * Splits a string into chunks of a specified maximum length, handling oversized lines.
 * @param {string} text The text to split.
 * @param {number} [maxLength=2000] The maximum length of each chunk.
 * @returns {string[]} An array of text chunks.
 */
function splitMessage(text, maxLength = 2000) {
    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');
    for (const line of lines) {
        // If a single line by itself is too long, we must split it.
        if (line.length > maxLength) {
            // First, send off whatever we have in the current chunk.
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            // Now, split the long line into smaller pieces.
            const lineChunks = line.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
            chunks.push(...lineChunks);
            continue; // Continue to the next line in the original text
        }

        // If adding the next line would make the current chunk too long...
        if (currentChunk.length + line.length + 1 > maxLength) {
            // ...send the current chunk and start a new one.
            chunks.push(currentChunk);
            currentChunk = '';
        }

        // Add the line to the current chunk.
        currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    }

    // Add the final chunk if it has any content.
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}


module.exports = {
    name: 'residentAppSubmission',
    async execute(payload, client) {
        const { user, guildId, formData } = payload;
        logger.info(`Processing residentAppSubmission event for user ${user.tag}`);

        try {
            const config = configManager.get();
            const appChannelId = config.residentAppChannelId ? config.residentAppChannelId[0] : null;

            if (!appChannelId) {
                logger.error("residentAppChannelId is not configured in the database.");
                return;
            }

            const appChannel = await client.channels.fetch(appChannelId);
            if (!appChannel) {
                logger.error(`Could not find the resident app channel with ID: ${appChannelId}`);
                return;
            }

            // Save the main application data to the database first
            const residentRecord = {
                discord_id: user.id,
                character_name: formData.character_name,
                alts: formData.alts ? JSON.stringify(formData.alts) : JSON.stringify([]),
                forum_identity: formData.forum_identity,
                discord_identity: formData.discord_identity,
                wtm_time: formData.wtm_time,
                logistics_ships: formData.logistics_ships ? JSON.stringify(formData.logistics_ships) : JSON.stringify([]),
                battleship_ships: formData.battleship_ships ? JSON.stringify(formData.battleship_ships) : JSON.stringify([]),
                t2_guns: formData.t2_guns,
                command_time_estimate: formData.command_time_estimate,
                why_commander: formData.why_commander,
                why_wtm: formData.why_wtm
            };

            const sql = `
                INSERT INTO resident_applications 
                (discord_id, character_name, alts, forum_identity, discord_identity, wtm_time, logistics_ships, battleship_ships, t2_guns, command_time_estimate, why_commander, why_wtm) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const values = Object.values(residentRecord);

            await db.query(sql, values);
            logger.success(`Resident application for ${formData.character_name} has been successfully saved to the database.`);

            const commanderRole = config.commanderRoles ? config.commanderRoles[0] : null;
            if (!commanderRole) {
                logger.warn('commanderRoles is not configured. Cannot mention role in new thread.');
            }

            const thread = await appChannel.threads.create({
                name: `Application - ${formData.character_name}`,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                type: ChannelType.PrivateThread,
                invitable: false, // This ensures only moderators can invite others
                reason: `New resident application from ${user.tag}`,
            });

            if (commanderRole) {
                await thread.send(`<@&${commanderRole}>, a new resident application has been submitted.`);
            }

            const appEmbed = buildResidentAppEmbed(payload);
            await thread.send({ embeds: [appEmbed] });

            const longAnswers = [
                `**Why do you want to be a commander with WTM?**\n\`\`\`${formData.why_commander}\`\`\``,
                `**Why do you like Flying with WTM?**\n\`\`\`${formData.why_wtm}\`\`\``
            ].join('\n\n');

            const chunks = splitMessage(longAnswers);
            for (const chunk of chunks) {
                await thread.send({ content: chunk });
            }

            // Automatic Character Registration & Deletion Logic
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(user.id);
            const statusMessages = [];

            // 1. Handle Deletions
            const initialAlts = formData.initial_alts ? (Array.isArray(formData.initial_alts) ? formData.initial_alts : [formData.initial_alts]) : [];
            const submittedAlts = formData.alts ? (Array.isArray(formData.alts) ? formData.alts : [formData.alts]) : [];
            const altsToRemove = initialAlts.filter(alt => !submittedAlts.includes(alt));

            if (altsToRemove.length > 0) {
                statusMessages.push('**Alt Deletion Status:**');
                for (const altNameToDelete of altsToRemove) {
                    const result = await charManager.deleteAlt(user.id, altNameToDelete);
                    if (result.success) {
                        statusMessages.push(`- ✅ Successfully removed **${altNameToDelete}**.`);
                    } else {
                        statusMessages.push(`- ⚠️ Could not remove **${altNameToDelete}** (may have already been removed).`);
                    }
                }
            }

            // 2. Handle New Alts
            const newAltsToAdd = submittedAlts.filter(alt => !initialAlts.includes(alt));
            if (newAltsToAdd.length > 0) {
                statusMessages.push('\n**New Alts Status:**');
                for (const altName of newAltsToAdd) {
                    const altResult = await charManager.addAlt(user.id, altName);
                    statusMessages.push(`- ${altResult.success ? '✅' : '⚠️'} **${altName}**: ${altResult.message}`);
                }
            }

            // 3. Handle Main Character
            statusMessages.push('\n**Main Character Status:**');
            const mainResult = await charManager.addMain(user.id, formData.character_name, member.roles.cache.map(r => r.id));
            statusMessages.push(`- ${mainResult.success ? '✅' : '⚠️'} ${mainResult.message}`);

            if (statusMessages.length > 0) {
                await thread.send(statusMessages.join('\n'));
            }

            try {
                await user.send("Your application has been successfully submitted and is now under review. We'll be in touch!");
            } catch (dmError) {
                logger.warn(`Could not send application confirmation DM to ${user.tag}.`);
            }

        } catch (error) {
            logger.error('Failed to process residentAppSubmission event:', error);
            try {
                await user.send("There was a critical error while submitting your application. Please contact a commander.");
            } catch (dmError) {
                logger.error(`Failed to send follow-up error message to ${user.tag}:`, dmError);
            }
        }
    }
};
