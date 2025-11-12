/**
 * Manages ESI authentication and token refreshing.
 */
class AuthManager {
    /**
     * @param {object} plugin - The core plugin instance.
     */
    constructor(plugin) {
        this.client = plugin.client;
        this.db = plugin.db;
        this.logger = plugin.logger;
        this.config = plugin.config;
        this.esiService = plugin.esiService; // Assumes esiService is passed
    }

    /**
     * Retrieves a valid ESI access token for a given Discord user ID.
     * Handles refreshing the token if it's expired.
     * @param {string} discordId - The Discord user's ID.
     * @returns {Promise<string|null>} A valid access token, or null.
     */
    async getAccessToken(discordId) {
        this.logger.debug(`[AuthManager] Getting access token for ${discordId}`);
        const ESI_CLIENT_ID = this.config.ESI_CLIENT_ID;
        const ESI_SECRET_KEY = this.config.ESI_SECRET_KEY;

        if (!ESI_CLIENT_ID || !ESI_SECRET_KEY) {
            logger.error('ESI_CLIENT_ID or ESI_SECRET_KEY not found in .env file. Cannot refresh token.');
            return null;
        }

        const userData = await getUserAuthData(discordId);

        if (!userData || !userData.refresh_token) {
            return null; // User not authenticated or missing refresh token
        }

        const isExpired = Date.now() >= userData.token_expiry - (60 * 1000);

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

            // Save the new tokens back to the specific character
            const updateSql = 'UPDATE users SET access_token = ?, refresh_token = ?, token_expiry = ? WHERE character_id = ?';
            await this.db.query(updateSql, [access_token, refresh_token, newExpiryTimestamp, userData.character_id]);

            logger.success(`Successfully refreshed token for ${userData.character_name}.`);
            return access_token;

        } catch (error) {
            if (error.response && error.response.status === 400) {
                logger.warn(`Refresh token for ${userData.character_name} (${discordId}) is invalid or revoked. Clearing from database.`);
                await removeAuth(discordId);
            } else {
                const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                logger.error(`Error refreshing ESI token for ${discordId}: ${errorMessage}`);
            }
            return null;
        }
    }

    async saveUserAuth(discordId, authData) {
        try {
            // First, ensure no other character for this user is the mailing character
            const clearSql = 'UPDATE users SET is_mailing_char = 0 WHERE discord_id = ?';
            await this.db.query(clearSql, [discordId]);

            // Now, update the specific character with auth tokens and set as mailing char
            const updateSql = `
                UPDATE users 
                SET 
                    access_token = ?, 
                    refresh_token = ?, 
                    token_expiry = ?,
                    is_mailing_char = 1
                WHERE character_id = ? AND discord_id = ?`;

            await this.db.query(updateSql, [
                authData.access_token,
                authData.refresh_token,
                authData.token_expiry,
                authData.character_id,
                discordId
            ]);
            logger.success(`Saved/updated auth data and set mailing character for ${authData.character_name} (${discordId})`);
        } catch (error) {
            logger.error(`Error in saveUserAuth for ${discordId}:`, error);
        }
    }

    /**
    * Fetches the authentication data for the user's designated mailing character.
    * @param {string} discordId - The user's Discord ID.
    * @returns {Promise<object|null>} The auth data or null if not found.
    */
    async getUserAuthData(discordId) {
        try {
            const sql = 'SELECT * FROM users WHERE discord_id = ? AND is_mailing_char = 1';
            const rows = await this.db.query(sql, [discordId]);
            return rows[0] || null;
        } catch (error) {
            logger.error(`Error fetching user auth data for ${discordId}:`, error);
            return null;
        }
    }

    /**
     * Removes a user's authentication data from the database by setting token fields to NULL.
     * @param {string} discordId - The Discord ID of the user.
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async removeAuth(discordId) {
        try {
            const sql = 'UPDATE users SET access_token = NULL, refresh_token = NULL, token_expiry = NULL, is_mailing_char = 0 WHERE discord_id = ? AND is_mailing_char = 1';
            const result = await this.db.query(sql, [discordId]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`Error removing auth data for user ${discordId}:`, error);
            return false;
        }
    }

    // ... Add other methods from your old authManager.js ...
}

module.exports = AuthManager;