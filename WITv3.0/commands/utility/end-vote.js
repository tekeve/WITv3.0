const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('@helpers/database');
const logger = require('@helpers/logger');
const voteManager = require('@helpers/voteManager');

module.exports = {
    // Custom permissions property for your command handler
    permissions: ['council'],

    // Autocomplete property
    autocomplete: null,

    data: new SlashCommandBuilder()
        .setName('end-vote')
        .setDescription('ADMIN: Ends the active vote in this channel and tallies the results immediately.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Find the active vote for this channel
            const votes = await db.query('SELECT vote_id, title FROM votes WHERE channel_id = ? AND is_active = 1', [interaction.channelId]);

            if (votes.length === 0) {
                return interaction.editReply({ content: 'There is no active vote in this channel to end.', ephemeral: true });
            }

            const vote = votes[0];
            const voteId = vote.vote_id;

            // Manually trigger the tallying process.
            // We pass in a "job" object similar to what the scheduler would use.
            // The tallyVote function will handle all logic:
            // 1. Calculating results
            // 2. Posting results
            // 3. Deactivating the vote
            // 4. Deleting the scheduled job
            logger.info(`Admin ${interaction.user.tag} is manually ending vote ${voteId} (${vote.title}).`);

            // Pass the client from the interaction
            await voteManager.tallyVote(voteId, interaction.client);

            return interaction.editReply({
                content: `Successfully ended and tallied the vote: **${vote.title}**. The results have been posted.`,
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Error in /end-vote command for user ${interaction.user.id}:`, error);
            await interaction.editReply({ content: 'An error occurred while ending the vote. Please check the logs.', ephemeral: true });
        }
    },
};