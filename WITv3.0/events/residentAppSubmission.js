const { EmbedBuilder, MessageFlags, ChannelType, ThreadAutoArchiveDuration } = require('discord.js');
const logger = require('@helpers/logger');
const { buildResidentAppEmbed } = require('@embeds/residentAppEmbed.js');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database');
const charManager = require('@helpers/characterManager');

/**
 * Splits a string into chunks of a specified maximum length.
 * @param {string} text The text to split.
 * @param {number} maxLength The maximum length of each chunk.
 * @returns {string[]} An array of text chunks.
 */
function splitMessage(text, maxLength = 2000) {
    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');
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


module.exports = {
    name: 'residentAppSubmission',
    async execute(payload, client) {
        logger.info(`Processing residentAppSubmission event for user ${payload.user.tag}`);
        const { interaction, user, formData } = payload;
        const config = configManager.get();

        try {
            // --- DATABASE INSERTION ---
            const residentRecord = {
                discord_id: user.id,
                character_name: formData.character_name,
                alts: formData['alts[]'] ? JSON.stringify(formData['alts[]']) : JSON.stringify([]),
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const values = Object.values(residentRecord);

            await db.query(sql, values);
            logger.success(`Resident application for ${formData.character_name} has been successfully saved to the database.`);

        } catch (dbError) {
            logger.error('Database Fail, Resident Application', dbError);
        }

        try {
            const appChannelId = config.residentAppChannelId ? config.residentAppChannelId[0] : null;
            if (!appChannelId) {
                logger.error("residentAppChannelId is not configured in the database.");
                return;
            }

            const appChannel = await client.channels.fetch(appChannelId);
            const commanderRoles = config.commanderRoles || [];
            const roleMentions = commanderRoles.map(id => `<@&${id}>`).join(' ');

            const newThread = await appChannel.threads.create({
                name: `Application - ${formData.character_name}`,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                type: ChannelType.PrivateThread,
                reason: `New resident application from ${formData.character_name}`,
            });

            await newThread.send({ content: `New application submitted. ${roleMentions}` });

            const appEmbed = buildResidentAppEmbed(payload);
            await newThread.send({ embeds: [appEmbed] });

            // --- MAIN CHARACTER REGISTRATION ---
            const member = await interaction.guild.members.fetch(user.id);
            const roles = member.roles.cache.map(role => role.id);
            const mainRegResult = await charManager.addMain(user.id, formData.character_name, roles);
            await newThread.send(`**Main Character Registration Status:**\n- ${mainRegResult.message}`);

            // --- ALT CHARACTER REGISTRATION ---
            const altRegistrationResults = [];
            const submittedAlts = formData['alts[]']; // The name now has brackets
            if (submittedAlts && Array.isArray(submittedAlts)) {
                for (const altName of submittedAlts) {
                    const result = await charManager.addAlt(user.id, altName);
                    altRegistrationResults.push(`- **${altName}**: ${result.message}`);
                }
            }
            if (altRegistrationResults.length > 0) {
                const registrationStatusMessage = `**Alt Registration Status:**\n${altRegistrationResults.join('\n')}`;
                await newThread.send({ content: registrationStatusMessage });
            }

            // --- LONG FORM ANSWERS ---
            const longAnswers = `
**Why do you want to be a commander with WTM?**
\`\`\`
${formData.why_commander || 'No answer provided.'}
\`\`\`
**Why do you like Flying with WTM?**
\`\`\`
${formData.why_wtm || 'No answer provided.'}
\`\`\`
            `.trim();

            const chunks = splitMessage(longAnswers);
            for (const chunk of chunks) {
                await newThread.send({ content: chunk });
            }

            await interaction.followUp({
                content: 'Your application has been successfully submitted!',
                flags: [MessageFlags.Ephemeral]
            });

        } catch (discordError) {
            logger.error('Failed to process residentAppSubmission event (Discord part):', discordError);
        }
    }
};

