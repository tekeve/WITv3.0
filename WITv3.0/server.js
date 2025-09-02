const express = require('express');
const axios = require('axios');
const authManager = require('@helpers/authManager.js');
const { esi } = require('./config.js');
require('dotenv').config();
const logger = require('@helpers/logger');

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

// This function will be called from app.js and passed the Discord client instance
function startServer(client) {
    const app = express();
    const port = 3000;

    app.get('/callback', async (req, res) => {
        const { code, state } = req.query;

        if (!code || !state) {
            return res.status(400).send('<h1>Error</h1><p>Missing authorization code or state.</p>');
        }

        // Security check: Validate the state
        const discordId = client.esiStateMap.get(state);
        if (!discordId) {
            logger.error('Invalid or expired state received in ESI callback.');
            return res.status(400).send('<h1>Error</h1><p>Invalid or expired state. Please try the /auth login command again.</p>');
        }
        // State is used once, so delete it
        client.esiStateMap.delete(state);

        try {
            // 1. Exchange the authorization code for tokens
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

            // 2. Verify the access token to get character details
            const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            });

            const { CharacterID, CharacterName } = verifyResponse.data;

            // 3. Store the tokens and character info by calling a method in authManager.js
            authManager.saveUserAuth(discordId, {
                character_id: CharacterID,
                character_name: CharacterName,
                access_token: access_token,
                refresh_token: refresh_token,
                token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
            });

            logger.success(`Successfully authenticated character ${CharacterName} for Discord user ${discordId}.`);
            res.send('<h1>Authentication Successful!</h1><p>You can now close this window and use the bot\'s ESI features.</p>');

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
