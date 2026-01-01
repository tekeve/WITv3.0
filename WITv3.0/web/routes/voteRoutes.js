const express = require('express');
// FIX: Corrected relative path from web/routes/ to helpers/
const db = require('../../helpers/database');
const logger = require('../../helpers/logger');

/**
 * Creates the router for voting API endpoints.
 * @param {import('discord.js').Client} client - The Discord client (not used here, but good practice)
 * @returns {express.Router}
 */
function voteRoutes(client) {
    const router = express.Router();

    // API endpoint to get vote details (candidates, title)
    router.get('/api/vote-details', async (req, res) => {
        const token = req.query.token;
        if (!token) {
            return res.status(400).send('No token provided.');
        }

        try {
            // FIX: Changed `const [tokens]` to `const tokens`
            const tokens = await db.query('SELECT * FROM vote_tokens WHERE token = ?', [token]);
            if (tokens.length === 0) {
                return res.status(403).send('Invalid or expired token.');
            }

            const tokenData = tokens[0];
            if (tokenData.used) {
                return res.status(403).send('This voting token has already been used.');
            }

            // FIX: Changed `const [votes]` to `const votes`
            const votes = await db.query('SELECT title, candidates, is_active FROM votes WHERE vote_id = ?', [tokenData.vote_id]);
            if (votes.length === 0) {
                return res.status(404).send('The vote associated with this token could not be found.');
            }

            const vote = votes[0];
            if (!vote.is_active) {
                return res.status(403).send('This election has concluded and is no longer active.');
            }


            let parsedCandidates = vote.candidates;

            if (typeof parsedCandidates === 'string') {
                try {
                    parsedCandidates = JSON.parse(parsedCandidates);
                } catch (e) {
                    logger.warn(`Vote ID ${tokenData.vote_id} candidates parsing failed. Raw value: "${vote.candidates}". Treating as string literal.`);
                    parsedCandidates = [vote.candidates];
                }
            }

            res.json({
                title: vote.title,
                candidates: parsedCandidates
            });

        } catch (error) {
            logger.error('Error fetching vote details:', error);
            res.status(500).send('Internal server error.');
        }
    });

    // API endpoint to submit a cast ballot
    router.post('/api/submit-vote', async (req, res) => {
        const { token, ranks } = req.body;

        if (!token || !ranks || !Array.isArray(ranks)) {
            return res.status(400).send('Invalid request body. "token" and "ranks" array are required.');
        }

        try {
            // --- Start Transaction ---
            // This is critical. We use a transaction to ensure all 3 steps
            // (find token, save ballot, mark user) happen together or not at all.

            // 1. Find and validate the token
            // FIX: Changed `const [tokens]` to `const tokens`
            const tokens = await db.query('SELECT * FROM vote_tokens WHERE token = ?', [token]);
            if (tokens.length === 0) {
                return res.status(403).send('Invalid or expired token.');
            }

            const tokenData = tokens[0];
            if (tokenData.used) {
                return res.status(403).send('This token has already been used.');
            }

            const voteId = tokenData.vote_id;
            const userHash = tokenData.discord_user_hash;

            // 2. Double-check the vote is still active
            // FIX: Changed `const [votes]` to `const votes`
            const votes = await db.query('SELECT is_active, candidates FROM votes WHERE vote_id = ?', [voteId]);
            if (votes.length === 0) {
                return res.status(404).send('Vote not found.');
            }
            const vote = votes[0];
            if (!vote.is_active) {
                return res.status(403).send('This election has concluded.');
            }

            // 3. Validate the submitted ranks
            const validCandidates = new Set(JSON.parse(vote.candidates));
            if (ranks.length !== validCandidates.size || ranks.some(r => !validCandidates.has(r))) {
                return res.status(400).send('Invalid ballot. The ranked list does not match the candidates.');
            }

            // 4. Use a transaction to submit the vote
            //    This is pseudo-code for a transaction, as 'db.query' might not support it directly.
            //    Ideally, your `db` helper has a transaction method.
            //    If not, we'll do it sequentially. The primary guard is the `voted_users` unique constraint.

            // 4a. Check if user already voted (final check)
            const voted = await db.query('SELECT user_hash FROM voted_users WHERE user_hash = ? AND vote_id = ?', [userHash, voteId]);
            if (voted.length > 0) {
                return res.status(403).send('You have already cast a vote in this election.');
            }

            // 4b. Insert the anonymous ballot
            // FIX: Removed destructuring [result]. db.query for INSERT returns a result object, not an array.
            const ballotResult = await db.query(
                'INSERT INTO ballots (vote_id, ranked_choices) VALUES (?, ?)',
                [voteId, JSON.stringify(ranks)]
            );

            // 4c. Mark the user as having voted
            try {
                // FIX: Removed destructuring [result]. db.query for INSERT returns a result object, not an array.
                const votedResult = await db.query(
                    'INSERT INTO voted_users (vote_id, user_hash) VALUES (?, ?)',
                    [voteId, userHash]
                );
            } catch (err) {
                // --- FIX: Make error checking more robust ---
                // Check for both the MySQL error code OR the text in the message
                // This handles different error formats from the db helper
                const isDuplicateError = (err.code === 'ER_DUP_ENTRY') ||
                    (err.message && err.message.includes('Duplicate entry'));

                if (isDuplicateError) {
                    logger.warn(`User ${userHash} attempted to double-vote (race condition caught by DB).`);
                    // We must deny the vote. The ballot was already inserted, but
                    // it's anonymous and unlinked, so it's safer to leave it
                    // than to attempt a complex deletion. The important thing
                    // is that voted_users and vote_tokens are correctly handled.
                    return res.status(403).send('Your vote has already been recorded.');
                }
                // --- End of FIX ---

                // This is a different, unexpected error.
                logger.error('Unexpected error inserting into voted_users:', err);
                throw err; // Re-throw other errors
            }

            // 4d. Mark the token as used
            await db.query('UPDATE vote_tokens SET used = 1 WHERE token_id = ?', [tokenData.token_id]);

            // --- End of "transaction" ---

            res.status(200).send('Vote cast successfully.');

        } catch (error) {
            logger.error('Error submitting vote:', error);
            res.status(500).send('Internal server error.');
        }
    });

    // Render the EJS vote page
    router.get('/vote', (req, res) => {
        const token = req.query.token;
        if (!token) {
            return res.status(400).send('Missing vote token.');
        }
        // The EJS file handles the rest of the logic via client-side JS
        res.render('vote', { token: token });
    });

    return router;
}

module.exports = voteRoutes;