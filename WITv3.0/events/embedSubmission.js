const { MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');

module.exports = {
    name: 'embedSubmission',
    async execute(payload, client) {
        const { interaction, channelId, embedData, content } = payload;
        logger.info(`Processing embedSubmission event from ${interaction.user.tag} to channel ${channelId}`);

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                logger.error(`Embed submission failed: Channel ${channelId} not found.`);
                await interaction.followUp({
                    content: `Error: Could not find the channel with ID ${channelId}. The embed was saved but not sent.`,
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            const messagePayload = {};
            if (content && content.trim() !== '') {
                messagePayload.content = content;
            }

            // Ensure embed data is not an empty object before adding it to the payload
            if (embedData && Object.keys(embedData).length > 0) {
                messagePayload.embeds = [embedData];
            }

            if (!messagePayload.content && !messagePayload.embeds) {
                logger.warn(`Attempted to send an empty message/embed from embed creator by ${interaction.user.tag}`);
                await interaction.followUp({
                    content: `Your embed was saved, but it appears to be empty so it was not sent.`,
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            await channel.send(messagePayload);

            await interaction.followUp({
                content: `Embed successfully saved and sent to ${channel}!`,
                flags: [MessageFlags.Ephemeral]
            });

        } catch (error) {
            logger.error('Failed to process embedSubmission event:', error);
            try {
                await interaction.followUp({
                    content: `The embed was saved, but an error occurred while sending it: \`${error.message}\``,
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (followUpError) {
                logger.error('Failed to send follow-up error message for embed submission:', followUpError);
            }
        }
    }
};

