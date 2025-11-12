const db = require('./database');
const logger = require('./logger');
const { calculateSTV } = require('./stvCalculator');
const { EmbedBuilder } = require('discord.js');
const { table } = require('table'); // You may need to install this: npm install table

/**
 * Fetches votes, calculates results, and posts them.
 * This is called by the scheduler.
 * @param {number} voteId - The ID of the vote to tally.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
async function tallyVote(voteId, client) {
    logger.info(`Tallying vote ID: ${voteId}...`);
    try {
        // 1. Get vote details and mark as inactive
        const [votes] = await db.query('SELECT * FROM votes WHERE vote_id = ?', [voteId]);
        if (votes.length === 0) {
            logger.error(`Vote ID ${voteId} not found for tallying.`);
            return;
        }
        const vote = votes[0];

        // Mark as inactive
        await db.query('UPDATE votes SET is_active = 0 WHERE vote_id = ?', [voteId]);

        // 2. Get the channel
        const channel = await client.channels.cache.get(vote.channel_id);
        if (!channel) {
            logger.error(`Channel ${vote.channel_id} not found for vote ${voteId}.`);
            return;
        }

        // 3. Get all ballots
        const [ballotRows] = await db.query('SELECT ranked_choices FROM ballots WHERE vote_id = ?', [voteId]);

        const ballots = ballotRows.map(r => {
            try {
                return JSON.parse(r.ranked_choices);
            } catch (e) {
                logger.warn(`Could not parse ballot for vote ${voteId}: ${r.ranked_choices}`);
                return null;
            }
        }).filter(b => b !== null); // Filter out any corrupted ballots

        if (ballots.length === 0) {
            logger.info(`Vote ${voteId} ("${vote.title}") ended with 0 valid ballots.`);
            await channel.send(`**Vote Concluded: ${vote.title}**\n\nNo valid ballots were cast. No winner could be determined.`);
            return;
        }

        const candidates = JSON.parse(vote.candidates);
        const numWinners = vote.type === 'officer' ? 2 : 1;

        // 4. Calculate STV results
        const { winners, log } = calculateSTV(candidates, ballots, numWinners);

        // 5. Post results
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Vote Concluded: ${vote.title}`)
            .setDescription(`**Winner(s): ${winners.join(', ')}**\n\nA total of ${ballots.length} valid ballots were cast.`)
            .addFields({ name: 'Round-by-Round Calculation', value: `\`\`\`${log.join('\n')}\`\`\`` });

        await channel.send({ embeds: [embed] });

        // 6. Post anonymous ballot table
        try {
            const tableData = [
                ['Ballot ID', ...Array.from({ length: candidates.length }, (_, i) => `Pref ${i + 1}`)]
            ];

            ballots.forEach((ballot, index) => {
                const row = [`#${index + 1}`];
                for (let i = 0; i < candidates.length; i++) {
                    row.push(ballot[i] || '-'); // Push preference or '-' if empty
                }
                tableData.push(row);
            });

            const tableOutput = table(tableData, {
                header: {
                    alignment: 'center',
                    content: `All Anonymous Ballots (Total: ${ballots.length})`,
                },
            });

            // Discord has a 2000 char limit, split if necessary
            const chunks = tableOutput.match(/[\s\S]{1,1900}/g) || [];
            for (const chunk of chunks) {
                await channel.send(`\`\`\`\n${chunk}\n\`\`\``);
            }

        } catch (tableError) {
            logger.error(`Error generating ballot table for vote ${voteId}:`, tableError);
            await channel.send('An error occurred while generating the anonymous ballot table.');
        }

        // 7. Clean up anonymity data
        logger.info(`Cleaning up anonymity data for vote ${voteId}...`);
        await db.query('DELETE FROM voted_users WHERE vote_id = ?', [voteId]);
        await db.query('DELETE FROM vote_tokens WHERE vote_id = ?', [voteId]);
        logger.info(`Anonymity data for vote ${voteId} has been purged.`);

    } catch (error) {
        logger.error(`Failed to tally vote ${voteId}:`, error);
        // Try to notify channel of failure
        try {
            const [votes] = await db.query('SELECT channel_id FROM votes WHERE vote_id = ?', [voteId]);
            if (votes.length > 0) {
                const channel = await client.channels.cache.get(votes[0].channel_id);
                if (channel) {
                    await channel.send(`An critical error occurred during the vote tally for vote ID ${voteId}. The process could not be completed. Please contact an administrator.`);
                }
            }
        } catch (notifyError) {
            logger.error('Failed to notify channel of tally error:', notifyError);
        }
    }
}

module.exports = { tallyVote };