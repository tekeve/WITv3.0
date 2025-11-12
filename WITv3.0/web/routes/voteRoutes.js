const express = require('express');
const router = express.Router();
const db = require('../../helpers/database');
const logger = require('../../helpers/logger');
const crypto = require('crypto');

/**
 * Sets up the routes for the voting system.
 * @param {import('discord.js').Client} client - The Discord client instance (passed for pattern consistency).
 */
module.exports = (client) => {

    // Route to render the voting page
    router.get('/vote.html', (req, res) => {
        // We just render the ejs file. The token is handled by client-side JS.
        res.render('vote');
    });

    // API endpoint to get vote details (candidates, title)
    router.get('/api/vote-details', async (req, res) => {
        const { token } = req.query;

        if (!token) {
            return res.status(400).send('No token provided.');
        }

        try {
            const [tokens] = await db.query('SELECT * FROM vote_tokens WHERE token = ?', [token]);
            if (tokens.length === 0) {
                return res.status(403).send('Invalid token.');
            }

            const tokenData = tokens[0];

            if (tokenData.used) {
                return res.status(403).send('This voting link has already been used.');
            }

            // Optional: Check token expiry (e.g., if it's older than the vote's end_time)
            // For simplicity, we just check 'used' flag.

            const [votes] = await db.query('SELECT title, candidates, is_active FROM votes WHERE vote_id = ?', [tokenData.vote_id]);
            if (votes.length === 0) {
                return res.status(404).send('Associated vote not found.');
            }

            const vote = votes[0];

            if (!vote.is_active) {
                return res.status(403).send('This vote is no longer active.');
            }

            res.json({
                title: vote.title,
                candidates: JSON.parse(vote.candidates),
            });

        } catch (error) {
            logger.error('Error fetching vote details for token:', error);
            res.status(500).send('Server error validating token.');
        }
    });

    // API endpoint to submit a cast ballot
    router.post('/api/submit-vote', async (req, res) => {
        const { token, ranks } = req.body;

        if (!token || !ranks || !Array.isArray(ranks)) {
            return res.status(400).send('Missing token or ranked choices.');
        }

        try {
            // 1. Find and validate the token
            const [tokens] = await db.query('SELECT * FROM vote_tokens WHERE token = ?', [token]);
            if (tokens.length === 0) {
                return res.status(403).send('Invalid token.');
            }

            const tokenData = tokens[0];

            if (tokenData.used) {
                return res.status(403).send('This voting link has already been used.');
            }

            const voteId = tokenData.vote_id;

            // 2. Double-check the vote is still active
            const [votes] = await db.query('SELECT is_active, candidates FROM votes WHERE vote_id = ?', [voteId]);
            if (votes.length === 0) {
                return res.status(404).send('Associated vote not found.');
            }

            const vote = votes[0];
            if (!vote.is_active) {
                return res.status(403).send('This vote has just closed and is no longer active.');
            }

            // 3. Validate ballot ranks
            const validCandidates = new Set(JSON.parse(vote.candidates));
            if (ranks.length !== validCandidates.size) {
                return res.status(400).send('Ballot does not contain the correct number of candidates.');
            }
            for (const rank of ranks) {
                if (!validCandidates.has(rank)) {
                    return res.status(400).send(`Invalid candidate found in ballot: ${rank}`);
                }
            }

            // --- CRITICAL ANONYMITY STEP ---
            // Use a transaction to ensure all or nothing.
            const connection = await db.getConnection();
            await connection.beginTransaction();

            try {
                // 4. Mark token as used
                const [updateResult] = await connection.query('UPDATE vote_tokens SET used = 1 WHERE token_id = ? AND used = 0', [tokenData.token_id]);

                // Check if the update affected a row. If not, another request used this token *just* now.
                if (updateResult.affectedRows === 0) {
                    throw new Error('Token was used by a concurrent request.');
                }

                // 5. Add user hash to the permanent "voted_users" list to prevent new tokens
                // We use INSERT IGNORE just in case, though the logic in /vote command should prevent duplicates
                await connection.query('INSERT IGNORE INTO voted_users (vote_id, user_hash) VALUES (?, ?)', [
                    voteId,
                    tokenData.discord_user_hash
                ]);

                // 6. Insert the *anonymous* ballot
                await connection.query('INSERT INTO ballots (vote_id, ranked_choices) VALUES (?, ?)', [
                    voteId,
                    JSON.stringify(ranks) // Store the ranked list
                ]);

                // 7. Commit the transaction
                await connection.commit();

                res.status(200).send('Vote cast successfully.');

            } catch (txError) {
                await connection.rollback();
                logger.error('Vote submission transaction failed:', txError);
                if (txError.message.includes('concurrent')) {
                    res.status(409).send('Conflict: This vote was submitted simultaneously. Please try again.');
                } else {
                    res.status(500).send('An error occurred while saving your vote.');
                }
            } finally {
                connection.release();
            }
            // --- END TRANSACTION ---

        } catch (error) {
            logger.error('Error submitting vote:', error);
            res.status(500).send('Server error processing vote.');
        }
    });

    // Return the configured router to be used by server.js
    return router;
};