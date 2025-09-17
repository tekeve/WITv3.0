const axios = require('axios');
const authManager = require('@helpers/authManager.js');
const logger = require('@helpers/logger');
const db = require('@helpers/database'); // Import db for direct queries

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

/**
 * Creates the callback handler middleware for Express.
 * @param {Client} client The Discord client instance.
 * @returns An async function that handles the request and response.
 */
exports.handleCallback = (client) => async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.status(400).render('error', { title: 'Error: Missing Information', message: 'The callback from EVE Online was missing required parameters.' });
    }

    const discordId = client.esiStateMap.get(state);
    if (!discordId) {
        logger.error('Invalid or expired state received in ESI callback.');
        return res.status(400).render('error', { title: 'Error: Invalid State', message: 'Your authentication session is invalid or has expired. Please try again.' });
    }
    client.esiStateMap.delete(state);

    try {
        const base64Auth = Buffer.from(`${ESI_CLIENT_ID}:${ESI_SECRET_KEY}`).toString('base64');
        const tokenResponse = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            new URLSearchParams({ grant_type: 'authorization_code', code }),
            { headers: { 'Authorization': `Basic ${base64Auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Host': 'login.eveonline.com' } }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
            headers: { 'Authorization': `Bearer ${access_token}` },
        });

        const { CharacterID, CharacterName } = verifyResponse.data;

        // Check if the authenticated character is registered in our system
        const userCheckSql = 'SELECT character_id FROM users WHERE character_id = ? AND discord_id = ?';
        const userRows = await db.query(userCheckSql, [CharacterID, discordId]);

        if (userRows.length === 0) {
            logger.warn(`User ${discordId} tried to authenticate with unregistered character ${CharacterName} (${CharacterID}).`);
            return res.status(403).render('error', {
                title: 'Character Not Registered',
                message: `The character ${CharacterName} is not registered to your Discord account. Please add the character using the /addchar command before authenticating.`,
            });
        }

        const token_expiry = Date.now() + expires_in * 1000;

        await authManager.saveUserAuth(discordId, {
            character_id: CharacterID,
            character_name: CharacterName,
            access_token,
            refresh_token,
            token_expiry,
        });

        logger.success(`Successfully authenticated character ${CharacterName} for Discord user ${discordId}.`);
        res.render('success', {
            title: 'Authentication Successful!',
            message: `You have successfully linked the character ${CharacterName}.`,
        });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error('Error during ESI OAuth callback:', errorMessage);
        res.status(500).render('error', {
            title: 'Authentication Failed',
            message: 'An internal error occurred while processing your request with EVE Online.',
        });
    }
};

