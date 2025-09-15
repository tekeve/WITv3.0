const logger = require('@helpers/logger');
const { buildSrpEmbed } = require('@embeds/srpEmbed.js');

module.exports = {
    name: 'srpSubmission',
    async execute(payload, client) {
        logger.info(`Processing srpSubmission event for user ${payload.user.tag}`);
        const { interaction } = payload;

        try {
            const srpChannelId = process.env.SRP_CHANNEL_ID;
            if (!srpChannelId) {
                logger.error("SRP_CHANNEL_ID is not configured.");
                return interaction.followUp({ content: 'SRP submitted, but the bot is misconfigured. Could not post to the SRP channel.', ephemeral: true });
            }

            const srpChannel = await client.channels.fetch(srpChannelId);
            if (!srpChannel) {
                logger.error(`Could not find the SRP channel with ID: ${srpChannelId}`);
                return interaction.followUp({ content: 'SRP submitted, but the bot could not find the target channel.', ephemeral: true });
            }

            const srpEmbed = await buildSrpEmbed(payload);

            await srpChannel.send({ embeds: [srpEmbed] });

            await interaction.followUp({ content: 'Your SRP request has been successfully submitted and posted!', ephemeral: true });

        } catch (error) {
            logger.error('Failed to process srpSubmission event:', error);
            try {
                await interaction.followUp({ content: 'Your SRP was submitted, but a critical error occurred while posting to Discord.', ephemeral: true });
            } catch (followUpError) {
                logger.error('Failed to send follow-up error message:', followUpError);
            }
        }
    }
};
