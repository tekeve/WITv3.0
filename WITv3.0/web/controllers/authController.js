const axios = require('axios');
const authManager = require('@helpers/authManager.js'); // Path updated
const logger = require('@helpers/logger'); // Path updated

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

/**
 * Creates the callback handler middleware for Express.
 * This pattern allows us to pass the Discord client instance into the route handler.
 * @param {Client} client The Discord client instance.
 * @returns An async function that handles the request and response.
 */
exports.handleCallback = (client) => async (req, res) => {
    const { code, state } = req.query;

    // Validate that required query parameters are present
    if (!code || !state) {
        return res.status(400).render('error', {
            title: 'Error: Missing Information',
            message: 'The callback from EVE Online was missing a required authorization code or state parameter.',
        });
    }

    // Validate the state to prevent CSRF attacks
    const discordId = client.esiStateMap.get(state);
    if (!discordId) {
        logger.error('Invalid or expired state received in ESI callback.');
        return res.status(400).render('error', {
            title: 'Error: Invalid State',
            message: 'Your authentication session is invalid or has expired. Please try the /auth login command again in Discord.',
        });
    }
    // A state key should only ever be used once. Delete it immediately.
    client.esiStateMap.delete(state);

    try {
        // 1. Exchange the authorization code for tokens
        const base64Auth = Buffer.from(`${ESI_CLIENT_ID}:${ESI_SECRET_KEY}`).toString('base64');
        const tokenResponse = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            new URLSearchParams({ grant_type: 'authorization_code', code }),
            { headers: { 'Authorization': `Basic ${base64Auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Host': 'login.eveonline.com' } }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // 2. Verify the access token to get character details
        const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
            headers: { 'Authorization': `Bearer ${access_token}` },
        });

        const { CharacterID, CharacterName } = verifyResponse.data;

        // 3. Store the tokens and character info
        const expiryDate = new Date(Date.now() + expires_in * 1000);
        const formattedExpiry = expiryDate.toISOString().slice(0, 19).replace('T', ' ');

        authManager.saveUserAuth(discordId, {
            character_id: CharacterID,
            character_name: CharacterName,
            access_token,
            refresh_token,
            token_expiry: formattedExpiry,
        });

        logger.success(`Successfully authenticated character ${CharacterName} for Discord user ${discordId}.`);
        // Render the success page
        res.render('success', {
            title: 'Authentication Successful!',
            message: `You have successfully linked the character ${CharacterName}.`,
        });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error('Error during ESI OAuth callback:', errorMessage);
        // Render the generic error page
        res.status(500).render('error', {
            title: 'Authentication Failed',
            message: 'An internal error occurred while processing your request with EVE Online.',
        });
    }
};
