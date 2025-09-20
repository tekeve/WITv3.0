const { ThreadAutoArchiveDuration } = require('discord.js');
const logger = require('@helpers/logger');
const { buildResidentAppEmbed } = require('@embeds/residentAppEmbed.js');
const configManager = require('@helpers/configManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    name: 'residentAppSubmission',
    async execute(payload, client) {
        const { interaction, user, formData } = payload;
        const config = configManager.get();
        const appChannelId = config.residentAppChannelId ? config.residentAppChannelId[0] : null;

        if (!appChannelId) {
            logger.error("residentAppChannelId is not configured in the database.");
            return interaction.followUp({
                content: 'Your application was submitted, but the destination channel is not configured on the bot. Please contact an admin.',
                ephemeral: true
            });
        }

        try {
            const appChannel = await client.channels.fetch(appChannelId);
            if (!appChannel) {
                logger.error(`Could not find the resident app channel with ID: ${appChannelId}`);
                return;
            }

            // Find the Commander role to mention
            const commanderRoles = config.commanderRoles || [];
            const commanderRole = commanderRoles.length > 0 ? `<@&${commanderRoles[0]}>` : '@Commander';

            // Create the thread
            const thread = await appChannel.threads.create({
                name: `Application - ${formData.character_name}`,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                reason: `New resident application from ${formData.character_name}.`
            });

            logger.info(`Created new thread for resident application: ${thread.id}`);

            // 1. Send the initial ping
            await thread.send({ content: `${commanderRole}, a new resident application has been submitted.` });

            // 2. Build and send the main embed
            const appEmbed = await buildResidentAppEmbed(payload);
            await thread.send({ embeds: [appEmbed] });

            // 3. Build the long-form answers and send them in chunks
            const longAnswers = [
                `**What Logistics Ships can you fly?**\n${formData.logistics_ships || '_Not provided_'}`,
                `\n**What Battleships can you fly?**\n${formData.battleship_ships || '_Not provided_'}`,
                `\n**Why do you want to be a commander with WTM?**\n${formData.why_commander || '_Not provided_'}`,
                `\n**Why do you like Flying with WTM?**\n${formData.why_wtm || '_Not provided_'}`
            ].join('\n\n---\n');

            // --- FIX START: Split long answers into multiple messages ---
            const chunkSize = 2000;
            if (longAnswers.length > 0) {
                for (let i = 0; i < longAnswers.length; i += chunkSize) {
                    const chunk = longAnswers.substring(i, i + chunkSize);
                    await thread.send({ content: chunk });
                }
            }
            // --- FIX END ---

            await interaction.followUp({
                content: 'Your application has been successfully submitted and posted!',
                ephemeral: true
            });

        } catch (error) {
            logger.error('Failed to process residentAppSubmission event:', error);
            try {
                await interaction.followUp({
                    content: 'Your application was submitted, but a critical error occurred while posting it to Discord. Please contact an admin.',
                    ephemeral: true
                });
            } catch (followUpError) {
                logger.error('Failed to send follow-up error message:', followUpError);
            }
        }
    }
};

