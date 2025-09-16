const axios = require('axios');
const logger = require('@helpers/logger');
const db = require('@helpers/dbService');

/**
 * Saves a new or updated authentication entry for a user.
 * @param {string} discordId - The user's Discord ID.
 * @param {object} authData - The authentication data from ESI.
 */
async function saveUserAuth(discordId, authData) {
    try {
        // This query will insert a new row or update the existing one if the discord_id already exists.
        const sql = `
            INSERT INTO auth (discord_id, character_id, character_name, access_token, refresh_token, token_expiry)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                character_id = VALUES(character_id),
                character_name = VALUES(character_name),
                access_token = VALUES(access_token),
                refresh_token = VALUES(refresh_token),
                token_expiry = VALUES(token_expiry)`;

        await db.query(sql, [
            discordId,
            authData.character_id,
            authData.character_name,
            authData.access_token,
            authData.refresh_token,
            authData.token_expiry
        ]);
        logger.success(`Saved/updated auth data for ${authData.character_name} (${discordId})`);
    } catch (error) {
        logger.error(`Error in saveUserAuth for ${discordId}:`, error);
    }
}

/**
 * Fetches the user's authentication data.
 * @param {string} discordId - The user's Discord ID.
 * @returns {Promise<object|null>} The auth data or null if not found.
 */
async function getUserAuthData(discordId) {
    try {
        const sql = 'SELECT * FROM auth WHERE discord_id = ?';
        const rows = await db.query(sql, [discordId]);
        return rows[0] || null;
    } catch (error) {
        logger.error(`Error fetching user auth data for ${discordId}:`, error);
        return null;
    }
}

/**
 * Removes a user's authentication data from the database.
 * @param {string} discordId - The Discord ID of the user.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function removeUser(discordId) {
    try {
        const sql = 'DELETE FROM auth WHERE discord_id = ?';
        const result = await db.query(sql, [discordId]);
        return result.affectedRows > 0;
    } catch (error) {
        logger.error(`Error removing auth data for user ${discordId}:`, error);
        return false;
    }
}

/**
 * Gets a valid access token, refreshing if necessary.
 * @param {string} discordId - The user's Discord ID.
 * @returns {Promise<string|null>} The valid access token or null if unavailable.
 */
async function getAccessToken(discordId) {
    // Read ESI credentials directly from environment variables
    const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
    const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;

    if (!ESI_CLIENT_ID || !ESI_SECRET_KEY) {
        logger.error('ESI_CLIENT_ID or ESI_SECRET_KEY not found in .env file. Cannot refresh token.');
        return null;
    }

    const userData = await getUserAuthData(discordId);

    if (!userData || !userData.refresh_token) {
        return null; // User not authenticated or missing refresh token
    }

    // Check if the token is expired or close to expiring (within 60 seconds)
    const expiryTimestamp = userData.token_expiry; // This is a BIGINT Unix timestamp in ms
    const isExpired = Date.now() >= expiryTimestamp - (60 * 1000);

    if (!isExpired) {
        return userData.access_token;
    }

    logger.info(`Access token for ${userData.character_name} expired. Refreshing...`);
    try {
        const base64Auth = Buffer.from(`${ESI_CLIENT_ID}:${ESI_SECRET_KEY}`).toString('base64');
        const response = await axios.post(
            'https://login.eveonline.com/v2/oauth/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: userData.refresh_token,
            }),
            {
                headers: {
                    'Authorization': `Basic ${base64Auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': 'login.eveonline.com',
                },
            }
        );

        const { access_token, refresh_token, expires_in } = response.data;
        const newExpiryTimestamp = Date.now() + expires_in * 1000;

        await saveUserAuth(discordId, {
            ...userData, // Carry over existing character info
            access_token: access_token,
            refresh_token: refresh_token,
            token_expiry: newExpiryTimestamp,
        });

        logger.success(`Successfully refreshed token for ${userData.character_name}.`);
        return access_token;

    } catch (error) {
        // If refresh fails (e.g., token revoked), clear the invalid token from the DB.
        if (error.response && error.response.status === 400) {
            logger.warn(`Refresh token for ${userData.character_name} (${discordId}) is invalid or revoked. Clearing from database.`);
            await removeUser(discordId);
        } else {
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            logger.error(`Error refreshing ESI token for ${discordId}: ${errorMessage}`);
        }
        return null;
    }
}

module.exports = {
    saveUserAuth,
    getUserAuthData,
    removeUser,
    getAccessToken,
};
