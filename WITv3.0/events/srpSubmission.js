const {MessageFlags } = require('discord.js')
const logger = require('@helpers/logger');
const { buildSrpEmbed } = require('@embeds/srpEmbed.js');

module.exports = {
    name: 'srpSubmission',
    async execute(payload, client) {
        logger.info(`Processing srpSubmission event for user ${payload.user.tag}`);
        const { interaction } = payload;

        // srpChannelId


        try {
            // Get the srpChannelId from the config object
            const srpChannelId = config.srpChannelId ? config.srpChannelId[0] : null;

            if (!srpChannelId) {
                logger.error("srpChannelId is not configured in the database.");
                return interaction.followUp({
                    content: 'SRP submitted, but the bot is misconfigured. Could not post to the SRP channel.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const srpChannel = await client.channels.fetch(srpChannelId);
            if (!srpChannel) {
                logger.error(`Could not find the SRP channel with ID: ${srpChannelId}`);
                return interaction.followUp({
                    content: 'SRP submitted, but the bot could not find the target channel.',
                    flags: [MessageFlags.Ephemeral] });
            }

            const srpEmbed = await buildSrpEmbed(payload);

            await srpChannel.send({ embeds: [srpEmbed] });

            await interaction.followUp({
                content: 'Your SRP request has been successfully submitted and posted!',
                flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            logger.error('Failed to process srpSubmission event:', error);
            try {
                await interaction.followUp({
                    content: 'Your SRP was submitted, but a critical error occurred while posting to Discord.',
                    flags: [MessageFlags.Ephemeral] });
            } catch (followUpError) {
                logger.error('Failed to send follow-up error message:', followUpError);
            }
        }
    }
};
