const db = require('@helpers/dbService');
const logger = require('@helpers/logger');

// Helper function to handle JSON parsing safely
function parseJson(jsonString) {
    if (!jsonString) return [];
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        logger.error('Failed to parse JSON string:', jsonString, error);
        return [];
    }
}

module.exports = {
    /**
     * Adds or updates a main character for a user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} main_character - The name of the main character.
     * @param {string[]} roles - An array of the user's Discord roles.
     * @returns {Promise<boolean>}
     */
    addMain: async (discordId, main_character, roles) => {
        const rolesJson = JSON.stringify(roles);
        try {
            const sql = `
                INSERT INTO commander_list (discord_id, main_character, roles) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE main_character = VALUES(main_character), roles = VALUES(roles)
            `;
            await db.query(sql, [discordId, main_character, rolesJson]);
            return true;
        } catch (error) {
            logger.error('Error in addMain:', error);
            return false;
        }
    },

    /**
     * Adds an alt character for a user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} altChar - The name of the alt character to add.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    addAlt: async (discordId, altChar) => {
        try {
            const user = await module.exports.getChars(discordId);
            if (!user || !user.main_character) {
                return { success: false, message: 'You must register a main character first.' };
            }

            const alts = parseJson(user.alt_characters);
            if (alts.some(alt => alt.toLowerCase() === altChar.toLowerCase())) {
                return { success: false, message: 'That alt is already registered.' };
            }

            alts.push(altChar);
            const altsJson = JSON.stringify(alts);
            const sql = 'UPDATE commander_list SET alt_characters = ? WHERE discord_id = ?';
            await db.query(sql, [altsJson, discordId]);
            return { success: true, message: `Alt character **${altChar}** has been added.` };
        } catch (error) {
            logger.error('Error in addAlt:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Deletes a character (main or alt) for a user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} charName - The name of the character to delete.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    deleteChar: async (discordId, charName) => {
        try {
            const userData = await module.exports.getChars(discordId);
            if (!userData) {
                return { success: false, message: 'No characters found for this user.' };
            }

            if (userData.main_character && userData.main_character.toLowerCase() === charName.toLowerCase()) {
                const sql = 'DELETE FROM commander_list WHERE discord_id = ?';
                await db.query(sql, [discordId]);
                return { success: true, message: `Main character ${charName} and all associated data have been deleted.` };
            }

            const alts = parseJson(userData.alt_characters);
            const initialAltCount = alts.length;
            const updatedAlts = alts.filter(alt => alt.toLowerCase() !== charName.toLowerCase());

            if (updatedAlts.length === initialAltCount) {
                return { success: false, message: `Could not find an alt named ${charName}.` };
            }

            const altsJson = JSON.stringify(updatedAlts);
            const sql = 'UPDATE commander_list SET alt_characters = ? WHERE discord_id = ?';
            await db.query(sql, [altsJson, discordId]);
            return { success: true, message: `Alt character ${charName} has been deleted.` };
        } catch (error) {
            logger.error('Error in deleteChar:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Gets all character data for a user.
     * @param {string} discordId - The user's Discord ID.
     * @returns {Promise<object|null>}
     */
    getChars: async (discordId) => {
        const sql = 'SELECT * FROM commander_list WHERE discord_id = ?';
        const rows = await db.query(sql, [discordId]);
        return rows[0] || null;
    },

    /**
     * Finds all users who have a specific role.
     * @param {string} roleName - The name of the role to search for.
     * @returns {Promise<object[]>}
     */
    findUsersInRole: async (roleName) => {
        const sql = 'SELECT main_character, discord_id FROM commander_list WHERE JSON_CONTAINS(roles, ?)';
        const rows = await db.query(sql, [`"${roleName}"`]);
        return rows.map(row => ({ main_character: row.main_character, discordId: row.discord_id }));
    },

    /**
     * Fetches all registered user IDs from the database.
     * @returns {Promise<string[]>} An array of Discord IDs.
     */
    getAllUsers: async () => {
        try {
            const sql = 'SELECT discord_id FROM commander_list';
            const rows = await db.query(sql);
            return rows.map(row => row.discord_id);
        } catch (error) {
            logger.error('Error in getAllUsers:', error);
            return [];
        }
    },
    /**
     * Updates the roles for a specific user in the database.
     * @param {string} discordId - The user's Discord ID.
     * @param {string[]} roles - The array of role names to save.
     */
    updateUserRoles: async (discordId, roles) => {
        const rolesJson = JSON.stringify(roles);
        try {
            const sql = 'UPDATE commander_list SET roles = ? WHERE discord_id = ?';
            await db.query(sql, [rolesJson, discordId]);
        } catch (error) {
            logger.error(`Error updating roles for ${discordId}:`, error);
        }
    }
};

