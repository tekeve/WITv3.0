const db = require('./dbService');
const logger = require('./logger');
const esiService = require('./esiService');

/**
 * Fetches character details from ESI using the correct endpoint.
 * @param {string} characterName - The name of the character to look up.
 * @returns {Promise<{character_id: number, character_name: string}|null>}
 */
async function getCharacterDetails(characterName) {
    try {
        // Using the POST /universe/ids endpoint is more direct for resolving names.
        // The body of the request should be an array of names.
        const idResponse = await esiService.post('/universe/ids/', [characterName]);

        // Check if the response includes a 'characters' array and if it's not empty
        if (!idResponse || !idResponse.characters || idResponse.characters.length === 0) {
            return null;
        }

        const characterData = idResponse.characters[0];

        return {
            character_id: characterData.id,
            character_name: characterData.name
        };
    } catch (error) {
        // Log the detailed error, but return null so the command can give a clean "character not found" message.
        logger.error(`Failed to get character details for ${characterName}:`, error.message);
        return null;
    }
}

module.exports = {
    /**
     * Adds a main character for a Discord user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} mainCharacterName - The name of the main character.
     * @param {string[]} roles - The user's current Discord roles.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    addMain: async (discordId, mainCharacterName, roles) => {
        const charDetails = await getCharacterDetails(mainCharacterName);
        if (!charDetails) {
            return { success: false, message: `Could not find character **${mainCharacterName}**.` };
        }

        try {
            // Check if the user already has a main character.
            const existingMainSql = `
                SELECT c.character_id FROM users u
                JOIN characters c ON u.main_character_id = c.character_id
                WHERE u.discord_id = ?`;
            const existingMain = await db.query(existingMainSql, [discordId]);

            if (existingMain.length > 0) {
                return { success: false, message: 'You already have a main character registered. Use `/delchar main` to remove it first.' };
            }

            // Add character to characters table
            const charSql = 'INSERT INTO characters (character_id, character_name, discord_id, is_main) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE character_name = VALUES(character_name), discord_id = VALUES(discord_id), is_main = 1';
            await db.query(charSql, [charDetails.character_id, charDetails.character_name, discordId]);

            // Add user to users table
            const rolesJson = JSON.stringify(roles);
            const userSql = 'INSERT INTO users (discord_id, main_character_id, roles) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE main_character_id = VALUES(main_character_id), roles = VALUES(roles)';
            await db.query(userSql, [discordId, charDetails.character_id, rolesJson]);

            return { success: true, message: `Main character **${charDetails.character_name}** has been registered.` };
        } catch (error) {
            logger.error('Error in addMain:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Adds an alt character for a Discord user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} altCharacterName - The name of the alt character.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    addAlt: async (discordId, altCharacterName) => {
        const user = await module.exports.getChars(discordId);
        if (!user || !user.main) {
            return { success: false, message: 'You must register a main character first.' };
        }

        const charDetails = await getCharacterDetails(altCharacterName);
        if (!charDetails) {
            return { success: false, message: `Could not find character **${altCharacterName}**.` };
        }

        if (user.alts.some(alt => alt.character_id === charDetails.character_id) || user.main.character_id === charDetails.character_id) {
            return { success: false, message: 'That character is already registered to your profile.' };
        }

        try {
            const sql = 'INSERT INTO characters (character_id, character_name, discord_id, is_main) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE character_name = VALUES(character_name), discord_id = VALUES(discord_id), is_main = 0';
            await db.query(sql, [charDetails.character_id, charDetails.character_name, discordId]);
            return { success: true, message: `Alt character **${charDetails.character_name}** has been added.` };
        } catch (error) {
            logger.error('Error in addAlt:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Deletes a user's entire profile (main, alts, user entry, auth).
     * @param {string} discordId - The user's Discord ID.
     * @param {string} mainCharNameToConfirm - The name for confirmation.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    deleteMain: async (discordId, mainCharNameToConfirm) => {
        const user = await module.exports.getChars(discordId);
        if (!user || !user.main) {
            return { success: false, message: 'No main character found for this user.' };
        }

        if (user.main.character_name.toLowerCase() !== mainCharNameToConfirm.toLowerCase()) {
            return { success: false, message: `The provided name "${mainCharNameToConfirm}" does not match the registered main character "${user.main.character_name}". No changes were made.` };
        }

        try {
            await db.query('DELETE FROM characters WHERE discord_id = ?', [discordId]);
            await db.query('DELETE FROM users WHERE discord_id = ?', [discordId]);
            await db.query('DELETE FROM auth WHERE discord_id = ?', [discordId]);
            return { success: true, message: `Main character ${user.main.character_name} and all associated alts have been deleted.` };
        } catch (error) {
            logger.error('Error in deleteMain:', error);
            return { success: false, message: 'A database error occurred during profile deletion.' };
        }
    },

    /**
     * Deletes a single alt character.
     * @param {string} discordId - The user's Discord ID.
     * @param {string} altName - The name of the alt to delete.
     * @returns {Promise<{success: boolean, message: string}>}
     */
    deleteAlt: async (discordId, altName) => {
        const user = await module.exports.getChars(discordId);
        if (!user) {
            return { success: false, message: 'No characters found for this user.' };
        }

        const altToDelete = user.alts.find(alt => alt.character_name.toLowerCase() === altName.toLowerCase());

        if (!altToDelete) {
            return { success: false, message: `Could not find an alt named **${altName}**.` };
        }

        try {
            await db.query('DELETE FROM characters WHERE character_id = ?', [altToDelete.character_id]);
            return { success: true, message: `Alt character **${altName}** has been deleted.` };
        } catch (error) {
            logger.error('Error in deleteAlt:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Gets all characters (main and alts) for a Discord user.
     * @param {string} discordId - The user's Discord ID.
     * @returns {Promise<{main: object, alts: object[]}|null>}
     */
    getChars: async (discordId) => {
        const sql = 'SELECT character_id, character_name, is_main FROM characters WHERE discord_id = ?';
        const rows = await db.query(sql, [discordId]);
        if (rows.length === 0) return null;

        const main = rows.find(r => r.is_main);
        const alts = rows.filter(r => !r.is_main);
        return { main, alts };
    },

    /**
     * Finds all users who have a specific Discord role.
     * @param {string} roleId - The ID of the Discord role.
     * @returns {Promise<Array<{main_character_name: string}>>}
     */
    findUsersInRole: async (roleId) => {
        const sql = `
            SELECT c.character_name as main_character_name
            FROM users u
            JOIN characters c ON u.main_character_id = c.character_id
            WHERE JSON_CONTAINS(u.roles, ?)`;
        // JSON_CONTAINS expects a stringified value, and the value we check against is the role ID.
        const rows = await db.query(sql, [`"${roleId}"`]);
        return rows;
    },

    /**
     * Updates the stored Discord roles for a user.
     * @param {string} discordId - The user's Discord ID.
     * @param {string[]} roles - An array of role IDs.
     */
    updateUserRoles: async (discordId, roles) => {
        const rolesJson = JSON.stringify(roles);
        // Ensure user exists before updating
        const userCheckSql = 'SELECT discord_id FROM users WHERE discord_id = ?';
        const userExists = await db.query(userCheckSql, [discordId]);
        if (userExists.length > 0) {
            const sql = 'UPDATE users SET roles = ? WHERE discord_id = ?';
            await db.query(sql, [rolesJson, discordId]);
        }
    },

    /**
     * Gets all registered users.
     * @returns {Promise<Array<{discord_id: string}>>}
     */
    getAllUsers: async () => {
        const sql = 'SELECT discord_id FROM users';
        return await db.query(sql);
    },
};



