const axios = require('axios');
const authManager = require('@helpers/authManager.js');
const charManager = require('@helpers/characterManager.js'); // Added characterManager
const logger = require('@helpers/logger');
const db = require('@helpers/database');

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

/**
 * Creates the callback handler middleware for Express.
 * @param {import('discord.js').Client} client The Discord client instance.
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

        // --- NEW LOGIC START ---
        // Check if this character is registered to ANY user.
        const charCheckSql = 'SELECT discord_id FROM users WHERE character_id = ?';
        const charRows = await db.query(charCheckSql, [CharacterID]);

        if (charRows.length > 0) {
            // Character is already registered.
            if (charRows[0].discord_id !== discordId) {
                // It's registered to someone else. Deny.
                logger.warn(`User ${discordId} tried to auth with character ${CharacterName} (${CharacterID}), but it's already registered to user ${charRows[0].discord_id}.`);
                return res.status(403).render('error', {
                    title: 'Character Already Registered',
                    message: `The character **${CharacterName}** is already registered to another Discord user. Please contact an admin if you believe this is an error.`,
                });
            }
            // If it is registered to the current user, we just proceed to save tokens.
        } else {
            // Character is not registered at all. Let's add it.
            logger.info(`Character ${CharacterName} is not registered. Attempting to auto-register for user ${discordId}.`);

            // Get the user's roles for registration
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            const member = await guild.members.fetch(discordId);
            const userRoles = member.roles.cache.map(role => role.id);

            // Check if the user already has a main character
            const existingChars = await charManager.getChars(discordId);
            let registrationResult;

            if (!existingChars || !existingChars.main) {
                // No main character exists, register this one as the main.
                logger.info(`No main character found for ${discordId}. Registering ${CharacterName} as main.`);
                registrationResult = await charManager.addMain(discordId, CharacterName, userRoles);
            } else {
                // A main character already exists, register this one as an alt.
                logger.info(`Main character found for ${discordId}. Registering ${CharacterName} as alt.`);
                registrationResult = await charManager.addAlt(discordId, CharacterName);
            }

            if (!registrationResult.success) {
                // If for some reason adding the character failed, inform the user.
                logger.error(`Auto-registration failed for ${CharacterName}: ${registrationResult.message}`);
                return res.status(500).render('error', {
                    title: 'Registration Failed',
                    message: `There was an issue automatically registering your character: ${registrationResult.message}`,
                });
            }
        }
        // --- NEW LOGIC END ---

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
            message: `You have successfully linked and authenticated the character **${CharacterName}**.`,
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
