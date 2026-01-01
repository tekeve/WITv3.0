const db = require('@helpers/database');
const logger = require('@helpers/logger');
const { calculateSTV } = require('./stvCalculator');
const { EmbedBuilder } = require('discord.js');

// Helper function to add a delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handles the entire process of tallying a vote, calculating results,
 * posting them, and cleaning up the database.
 *
 * @param {string | number} voteId - The ID of the vote to tally.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
async function tallyVote(voteId, client) {
    let vote; // Define vote here to be accessible in catch block
    let channel; // Define channel here for the catch block

    try {
        logger.info(`Tallying vote ID: ${voteId}`);

        // 1. Fetch Vote Details
        const votes = await db.query('SELECT * FROM votes WHERE vote_id = ?', [voteId]);

        if (votes.length === 0 || !votes[0]) {
            logger.warn(`TallyVote: Vote ID ${voteId} not found in database.`);
            await db.query("DELETE FROM scheduler WHERE job_id = ? AND task_type = 'tallyVote'", [voteId]);
            return;
        }

        vote = votes[0];

        if (!vote.is_active) {
            logger.warn(`TallyVote: Vote ID ${voteId} is already inactive. Cleaning up scheduler job.`);
            await db.query("DELETE FROM scheduler WHERE job_id = ? AND task_type = 'tallyVote'", [voteId]);
            return;
        }

        // 2. Fetch all Ballots
        const ballotsQuery = await db.query('SELECT ranked_choices FROM ballots WHERE vote_id = ?', [voteId]);
        const ballots = ballotsQuery.map(b => b.ranked_choices);

        // 3. Find Discord Channel
        channel = await client.channels.cache.get(vote.channel_id);
        if (!channel) {
            logger.error(`TallyVote: Could not find channel ID ${vote.channel_id} for vote ${voteId}. Results will not be posted.`);
        }

        // 4. Handle Tallying
        if (ballots.length === 0) {
            logger.warn(`Vote ${voteId} concluded with 0 ballots.`);
            if (channel) {
                const resultEmbed = new EmbedBuilder()
                    .setTitle(`Vote Concluded: ${vote.title}`)
                    .setColor('#FF0000') // Red for no votes
                    .setTimestamp()
                    .setFooter({ text: `Vote ID: ${vote.vote_id}` })
                    .setDescription('This vote has concluded, but no ballots were cast.')
                    .addFields({ name: 'Total Ballots Cast', value: '0' });
                await channel.send({ embeds: [resultEmbed] });
            }
        } else {
            // We have votes, run the STV calculation
            const candidates = vote.candidates;
            const numWinners = (vote.type === 'officer') ? 2 : 1;

            const { winners, log } = calculateSTV(candidates, ballots, numWinners);

            // --- Send Round-by-Round Embeds ---
            if (channel) {
                logger.info(`Sending round-by-round tally to channel ${channel.id}`);
                const logChunks = log.join('\n').split('\n\n---'); // Split log by rounds

                for (let i = 0; i < logChunks.length; i++) {
                    let chunk = logChunks[i];

                    // Re-add the '---' splitter if it's not the first chunk
                    if (i > 0) {
                        chunk = '---' + chunk;
                    }

                    // Determine title and color
                    let title = `Tally for "${vote.title}"`;
                    let color = '#0099ff'; // Blue

                    if (chunk.includes('Election Started')) {
                        title = `🗳️ Tallying Started: ${vote.title}`;
                        color = '#AAAAAA'; // Grey
                    } else if (chunk.includes('Round')) {
                        title = `🗳️ Tallying (Round ${chunk.match(/Round (\d+)/)[1]}): ${vote.title}`;
                    } else if (chunk.includes('Election Concluded')) {
                        title = `✅ Tallying Concluded: ${vote.title}`;
                        color = '#00FF00'; // Green
                    }

                    const roundEmbed = new EmbedBuilder()
                        .setTitle(title)
                        .setColor(color)
                        .setDescription('```' + chunk + '```')
                        .setFooter({ text: `Vote ID: ${vote.vote_id}` });

                    if (chunk.includes('Election Concluded')) {
                        roundEmbed.addFields(
                            { name: 'Total Ballots Cast', value: ballots.length.toString(), inline: true },
                            { name: 'Election Type', value: vote.type, inline: true },
                            { name: 'Winner(s)', value: winners.length > 0 ? winners.join('\n') : 'N/A' }
                        );
                    }

                    await channel.send({ embeds: [roundEmbed] });
                    await delay(1500); // Pause to avoid rate limits
                }
            }
            // --- End Round-by-Round ---

            // --- Send Paginated Ballot Embeds ---
            if (channel) {
                logger.info(`Sending paginated ballots to channel ${channel.id}`);
                await channel.send({ content: `--- **All ${ballots.length} Anonymous Ballots** ---` });
                await delay(1500);

                const ballotsPerPage = 20; // Max 20 ballots per embed
                const totalPages = Math.ceil(ballots.length / ballotsPerPage);

                for (let page = 0; page < totalPages; page++) {
                    const start = page * ballotsPerPage;
                    const end = start + ballotsPerPage;
                    const ballotChunk = ballots.slice(start, end);

                    const ballotStrings = ballotChunk.map((b, i) => {
                        const ballotNum = start + i + 1;
                        return `**[${ballotNum.toString().padStart(3, ' ')}]** ${b.join(' > ')}`;
                    });

                    const ballotEmbed = new EmbedBuilder()
                        .setTitle(`Anonymous Ballots for "${vote.title}"`)
                        .setColor('#FFFF00') // Yellow for ballots
                        .setDescription(ballotStrings.join('\n'))
                        .setFooter({ text: `Vote ID: ${vote.vote_id} | Page ${page + 1} of ${totalPages}` });

                    await channel.send({ embeds: [ballotEmbed] });
                    await delay(1500); // Pause to avoid rate limits
                }
            }
            // --- End Paginated Ballots ---
        }

        // 5. Database Cleanup (CRITICAL)
        logger.info(`Cleaning up database for vote ID ${voteId}...`);

        // Deactivate the vote
        await db.query('UPDATE votes SET is_active = 0 WHERE vote_id = ?', [voteId]);

        // Delete all anonymous ballots (Optional, but good for privacy)
        // await db.query('DELETE FROM ballots WHERE vote_id = ?', [voteId]);

        // Delete all identifying data (CRITICAL for anonymity)
        await db.query('DELETE FROM voted_users WHERE vote_id = ?', [voteId]);
        await db.query('DELETE FROM vote_tokens WHERE vote_id = ?', [voteId]);

        // Delete the scheduler job
        await db.query("DELETE FROM scheduler WHERE job_id = ? AND task_type = 'tallyVote'", [voteId]);

        logger.info(`Vote ${voteId} successfully tallied and cleaned up.`);

    } catch (error) {
        logger.error(`Failed to tally vote ${voteId}:`, error);

        try {
            // ATTEMPT TO RECOVER AND POST ERROR
            if (channel) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle(`Error Tallying Vote: ${vote ? vote.title : `ID ${voteId}`}`)
                    .setColor('#FF0000')
                    .setDescription('A critical error occurred while tallying the votes. The election has been halted. Please contact an administrator.\n\n**Error:**\n`' + error.message + '`')
                    .setTimestamp();
                await channel.send({ embeds: [errorEmbed] });
            }

            // CRITICAL: Still attempt cleanup to prevent loops
            logger.error(`Attempting emergency cleanup for vote ID ${voteId}...`);
            await db.query('UPDATE votes SET is_active = 0 WHERE vote_id = ?', [voteId]);
            await db.query("DELETE FROM scheduler WHERE job_id = ? AND task_type = 'tallyVote'", [voteId]);
            logger.error(`Emergency cleanup for vote ID ${voteId} complete. The vote is now inactive.`);

        } catch (recoveryError) {
            logger.error(`CRITICAL: Failed to recover from tallying error for vote ${voteId}. This vote may be stuck.`, recoveryError);
        }
    }
}

module.exports = { tallyVote };