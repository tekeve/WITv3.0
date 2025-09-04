const axios = require('axios');
require('dotenv').config();
const logger = require('@helpers/logger');
const db = require('@helpers/dbService');
const charManager = require('@helpers/characterManager');

const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
const ESI_SECRET_KEY = process.env.ESI_SECRET_KEY;


/**
 * Helper to format a JS Date object into a MySQL DATETIME compatible string.
 * @param {Date} date - The date object to format.
 * @returns {string} - The formatted date string (YYYY-MM-DD HH:MM:SS).
 */
const formatMySqlDateTime = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Saves or updates a user's authentication data in the database.
 * This now checks for a main character and adds alts.
 * @param {string} discordId - The user's Discord ID.
 * @param {object} authData - The authentication data object from ESI.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function saveUserAuth(discordId, authData) {
    // Check if the user has a main character registered
    const existingUser = await charManager.getChars(discordId);
    if (!existingUser || !existingUser.main_character) {
        return { success: false, message: 'No main character registered. Please use `/addchar main` first.' };
    }

    // User has a main, now check if the authenticated character matches
    if (existingUser.main_character.toLowerCase() === authData.character_name.toLowerCase()) {
        // It's the main character, update their ESI details
        try {
            const sql = 'UPDATE commander_list SET character_id = ?, character_name = ?, access_token = ?, refresh_token = ?, token_expiry = ? WHERE discord_id = ?';
            await db.query(sql, [authData.character_id, authData.character_name, authData.access_token, authData.refresh_token, authData.token_expiry, discordId]);
            return { success: true, message: `Successfully authenticated main character ${authData.character_name}.` };
        } catch (error) {
            logger.error(`Error updating main character auth data for ${discordId}:`, error);
            return { success: false, message: 'A database error occurred while updating your main character.' };
        }
    } else {
        // It's a different character, add it as an alt and update ESI details
        try {
            // First, add as an alt (this function handles checking for duplicates)
            await charManager.addAlt(discordId, authData.character_name);

            // Now, update the ESI details for the user. This will overwrite any previous auth.
            const sql = 'UPDATE commander_list SET character_id = ?, character_name = ?, access_token = ?, refresh_token = ?, token_expiry = ? WHERE discord_id = ?';
            await db.query(sql, [authData.character_id, authData.character_name, authData.access_token, authData.refresh_token, authData.token_expiry, discordId]);

            return { success: true, message: `Successfully authenticated alt character ${authData.character_name}. It has been added to your profile.` };
        } catch (error) {
            logger.error(`Error authenticating alt character for ${discordId}:`, error);
            return { success: false, message: 'A database error occurred while authenticating your alt character.' };
        }
    }
}


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

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token;
        const expiresIn = response.data.expires_in;

        // Update the user's data with the new tokens and expiry time
        const updateSql = 'UPDATE commander_list SET access_token = ?, refresh_token = ?, token_expiry = ? WHERE discord_id = ?';
        const newExpiry = formatMySqlDateTime(new Date(Date.now() + expiresIn * 1000));
        await db.query(updateSql, [newAccessToken, newRefreshToken, newExpiry, discordId]);

        return newAccessToken;

    } catch (error) {
        logger.error('Error refreshing token:', error.response ? error.response.data : error.message);
        return null; // Return null on error
    }
}

module.exports = {
    /**
     * Fetches a user's authentication data from the database.
     * @param {string} discordId - The user's Discord ID.
     * @returns {Promise<object|null>} The user's auth data or null.
     */
    getUserAuthData: async (discordId) => {
        try {
            const sql = 'SELECT discord_id, character_name, access_token, refresh_token, token_expiry FROM commander_list WHERE discord_id = ?';
            const rows = await db.query(sql, [discordId]);
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
            const sql = 'UPDATE commander_list SET character_id = NULL, character_name = NULL, access_token = NULL, refresh_token = NULL, token_expiry = NULL WHERE discord_id = ?';
            const result = await db.query(sql, [discordId]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error removing user auth data:', error);
            return false;
        }
    },

    // Export the primary functions
    saveUserAuth,
    getAccessToken,
};

