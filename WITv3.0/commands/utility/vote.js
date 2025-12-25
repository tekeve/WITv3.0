const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('@helpers/database');
const logger = require('@helpers/logger');
const crypto = require('crypto');

// Helper function for user hashing
// FIX: Added voteId to the hash to make it unique per-user-per-vote
function hashUser(userId, guildId, voteId) {
    // A simple, non-reversible hash. Using voteId ensures it's unique per vote.
    return crypto.createHash('sha256').update(userId + guildId + voteId + process.env.HASH_SECRET).digest('hex');
}

module.exports = {
    // Custom permissions property for your command handler
    permissions: ['line_commander'],

    // Autocomplete property, set to null as this command doesn't use it
    autocomplete: null,

    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Get your unique, anonymous link to vote in the active election.'),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Find the active vote for this channel
            const votes = await db.query('SELECT vote_id, title FROM votes WHERE channel_id = ? AND is_active = 1', [interaction.channelId]);

            if (votes.length === 0) {
                return interaction.editReply({ content: 'There is currently no active vote in this channel.', ephemeral: true });
            }

            const vote = votes[0];
            const voteId = vote.vote_id;

            // FIX: Generate the hash *after* we get the voteId
            const userHash = hashUser(interaction.user.id, interaction.guildId, voteId);

            // 1. Check if user has already voted
            // FIX: Corrected query to select `vote_id` instead of the non-existent `hash_id`
            const voted = await db.query('SELECT vote_id FROM voted_users WHERE user_hash = ? AND vote_id = ?', [userHash, voteId]);
            if (voted.length > 0) {
                return interaction.editReply({ content: 'You have already cast your vote for this election.', ephemeral: true });
            }

            // 2. Check if user has an *existing, unused* token
            const existingToken = await db.query('SELECT token FROM vote_tokens WHERE discord_user_hash = ? AND vote_id = ? AND used = 0', [userHash, voteId]);

            let token;
            if (existingToken.length > 0) {
                token = existingToken[0].token;
            } else {
                // 3. Generate new token if one doesn't exist
                token = crypto.randomBytes(32).toString('hex');
                await db.query(
                    'INSERT INTO vote_tokens (token, vote_id, discord_user_hash) VALUES (?, ?, ?)',
                    [token, voteId, userHash]
                );
            }

            // --- FIX: Ensure HOST_NAME has a protocol ---
            // ButtonBuilder.setURL() requires a full URL (e.g., https://...)
            // This ensures it works even if HOST_NAME is just "my-domain.com"
            const host = process.env.HOST_NAME.startsWith('http')
                ? process.env.HOST_NAME
                : `http://${process.env.HOST_NAME}`;

            const voteUrl = `${host}/vote?token=${token}`;
            // --- End of FIX ---

            // 4. Create the ephemeral button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(`Click to Vote for "${vote.title}"`)
                        .setURL(voteUrl)
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('🗳️')
                );

            // 5. Reply with the ephemeral button
            return interaction.editReply({
                content: `Here is your unique, anonymous button to vote for **${vote.title}**.\n\nOnly you can see this message and use this link. **Do not share it.**`,
                components: [row],
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Error in /vote command for user ${interaction.user.id}:`, error);
            // Catch block no longer needs to check for DM failure
            await interaction.editReply({ content: 'An error occurred while fetching your voting link. Please try again or contact an administrator.', ephemeral: true });
        }
    },
};