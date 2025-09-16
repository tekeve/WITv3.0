const express = require('express');
const axios = require('axios');
const authManager = require('@helpers/authManager.js');
const logger = require('@helpers/logger');

/**
 * Starts the Express server for the ESI OAuth2 callback.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
function startServer(client) {
    const app = express();
    const port = 3000;

    // Use ESI credentials directly from environment variables
    const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
    const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

    app.get('/callback', async (req, res) => {
        const { code, state } = req.query;

        if (!code || !state) {
            return res.status(400).send('<h1>Error</h1><p>Missing authorization code or state.</p>');
        }

        const discordId = client.esiStateMap.get(state);
        if (!discordId) {
            logger.error('Invalid or expired state received in ESI callback.');
            return res.status(400).send('<h1>Error</h1><p>Invalid or expired state. Please try the /auth login command again.</p>');
        }
        client.esiStateMap.delete(state);

        try {
            const base64Auth = Buffer.from(`${ESI_CLIENT_ID}:${ESI_SECRET_KEY}`).toString('base64');
            const tokenResponse = await axios.post(
                'https://login.eveonline.com/v2/oauth/token',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                }),
                {
                    headers: {
                        'Authorization': `Basic ${base64Auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Host': 'login.eveonline.com',
                    },
                }
            );

            const { access_token, refresh_token, expires_in } = tokenResponse.data;

            const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            });

            const { CharacterID, CharacterName } = verifyResponse.data;

            // Calculate expiry as a Unix timestamp in milliseconds
            const expiryTimestamp = Date.now() + expires_in * 1000;

            await authManager.saveUserAuth(discordId, {
                character_id: CharacterID,
                character_name: CharacterName,
                access_token: access_token,
                refresh_token: refresh_token,
                token_expiry: expiryTimestamp,
            });

            logger.success(`Successfully authenticated character ${CharacterName} for Discord user ${discordId}.`);
            res.send('<h1>Authentication Successful!</h1><p>You can now close this window. Your character has been authenticated.</p>');

        } catch (error) {
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error('Error during ESI OAuth callback:', errorMessage);
            res.status(500).send('<h1>Authentication Failed</h1><p>An error occurred while processing your request. Please try again.</p>');
        }
    });

    app.listen(port, () => {
        logger.info(`ESI auth callback server listening on port ${port}`);
    });
}

module.exports = { startServer };
