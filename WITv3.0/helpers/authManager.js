const axios = require('axios');
require('dotenv').config();
const logger = require('@helpers/logger');
const db = require('@helpers/dbService');

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;


/**
 * The main function to get a valid access token, refreshing if necessary.
 * @param {string} discordId - The user's Discord ID.
 * @returns {Promise<string|null>} The valid access token or null if unavailable.
 */
async function getAccessToken(discordId) {
    let userData;
    try {
        const sql = 'SELECT discord_id, access_token, refresh_token, token_expiry, character_name FROM commander_list WHERE discord_id = ?';
        const rows = await db.query(sql, [discordId]);
        userData = rows[0];
    } catch (error) {
        logger.error('Error fetching user data from DB:', error);
        return null;
    }

    if (!userData) {
        return null; // User not authenticated
    }

    // Check if the token is expired (or close to it)
    const tokenExpires = new Date(userData.token_expiry).getTime();
    const isExpired = Date.now() >= tokenExpires - (60 * 1000); // 60-second buffer

    if (!isExpired) {
        return userData.access_token;
    }

    // Token is expired, let's refresh it
    logger.log(`Access token for ${userData.character_name} expired. Refreshing...`);
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

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token;
        const expiresIn = response.data.expires_in;

        // Update the user's data with the new tokens and expiry time
        const updateSql = 'UPDATE commander_list SET access_token = ?, refresh_token = ?, token_expiry = ? WHERE discord_id = ?';
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
        await db.query(updateSql, [newAccessToken, newRefreshToken, newExpiry, discordId]);

        return newAccessToken;

    } catch (error) {
        logger.error('Error refreshing token:', error.response ? error.response.data : error.message);
        return null; // Return null on error
    }
}

module.exports = {
    /**
     * Saves or updates a user's authentication data in the database.
     * @param {string} discordId - The user's Discord ID.
     * @param {object} authData - The authentication data object.
     */
    saveUserAuth: async (discordId, authData) => {
        try {
            const sql = 'INSERT INTO commander_list (discord_id, access_token, refresh_token, token_expiry) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = VALUES(refresh_token), token_expiry = VALUES(token_expiry)';
            await db.query(sql, [discordId, authData.access_token, authData.refresh_token, authData.token_expiry]);
        } catch (error) {
            logger.error('Error saving user auth data:', error);
        }
    },

    /**
         * Fetches a user's authentication data from the database.
         * @param {string} discordId - The user's Discord ID.
         * @returns {Promise<object|null>} The user's auth data or null.
         */
    getUserAuthData: async (discordId) => {
        try {
            const sql = 'SELECT discord_id, character_name, access_token, refresh_token, token_expiry FROM commander_list WHERE discord_id = ?';
            const rows = await db.query(sql, [discordId]);1
            return rows[0] || null;
        } catch (error) {
            logger.error('Error fetching user auth data:', error);
            return null;
        }
    },

    /**
     * Removes a user's authentication data from the database.
     * @param {string} discordId - The user's Discord ID.
     * @returns {Promise<boolean>} True if the user was removed, false otherwise.
     */
    removeUser: async (discordId) => {
        try {
            const sql = 'DELETE FROM commander_list WHERE discord_id = ?';
            const result = await db.query(sql, [discordId]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error removing user:', error);
            return false;
        }
    },

    // Export the getAccessToken function
    getAccessToken: getAccessToken
};
