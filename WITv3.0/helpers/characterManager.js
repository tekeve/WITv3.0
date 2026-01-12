const db = require('@helpers/database');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');

/**
 * Fetches character details from ESI.
 * @param {string} characterName - The name of the character to look up.
 * @returns {Promise<{character_id: number, character_name: string}|null>}
 */
async function getCharacterDetails(characterName) {
    try {
        const idResponse = await esiService.post({
            endpoint: '/universe/ids/',
            data: [characterName],
            caller: __filename
        });
        if (!idResponse || !idResponse.characters || idResponse.characters.length === 0) {
            return null;
        }
        const characterData = idResponse.characters[0];
        return {
            character_id: characterData.id,
            character_name: characterData.name
        };
    } catch (error) {
        logger.error(`Failed to get character details for ${characterName}:`, error.message);
        return null;
    }
}

module.exports = {
    getCharacterDetails,
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
            const existingMain = await db.query('SELECT character_id FROM users WHERE discord_id = ? AND is_main = 1', [discordId]);
            if (existingMain.length > 0) {
                return { success: false, message: 'You already have a main character registered. Use `/delchar main` to remove it first.' };
            }

            const rolesJson = JSON.stringify(roles);
            const sql = 'INSERT INTO users (character_id, discord_id, character_name, roles, is_main) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), character_name = VALUES(character_name), roles = VALUES(roles), is_main = 1';
            await db.query(sql, [charDetails.character_id, discordId, charDetails.character_name, rolesJson]);

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
            const sql = 'INSERT INTO users (character_id, discord_id, character_name, is_main) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), character_name = VALUES(character_name), is_main = 0';
            await db.query(sql, [charDetails.character_id, discordId, charDetails.character_name]);
            return { success: true, message: `Alt character **${charDetails.character_name}** has been added.` };
        } catch (error) {
            logger.error('Error in addAlt:', error);
            return { success: false, message: 'A database error occurred.' };
        }
    },

    /**
     * Deletes a user's main character and all their alts.
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
            await db.query('DELETE FROM users WHERE discord_id = ?', [discordId]);
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
            await db.query('DELETE FROM users WHERE character_id = ? AND is_main = 0', [altToDelete.character_id]);
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
        const rows = await db.query('SELECT character_id, character_name, is_main, roles FROM users WHERE discord_id = ?', [discordId]);
        if (rows.length === 0) return null;

        const main = rows.find(r => r.is_main);
        const alts = rows.filter(r => !r.is_main);

        // FIX: Ensure roles are parsed from JSON string if they exist, and handle nulls
        if (main) {
            if (main.roles && typeof main.roles === 'string') {
                try {
                    main.roles = JSON.parse(main.roles);
                } catch (e) {
                    logger.error(`Failed to parse roles JSON for user ${discordId}:`, main.roles);
                    main.roles = []; // Default to empty array on parse error
                }
            } else {
                // If main.roles is null, undefined, or not a string, ensure it's an empty array.
                main.roles = [];
            }
        }

        return { main, alts };
    },

    /**
     * Finds all users who have a specific Discord role.
     * @param {string} roleId - The ID of the Discord role.
     * @returns {Promise<Array<{main_character_name: string}>>}
     */
    findUsersInRole: async (roleId) => {
        const sql = `
            SELECT character_name as main_character_name
            FROM users
            WHERE is_main = 1 AND JSON_CONTAINS(roles, ?)`;
        const rows = await db.query(sql, [`"${roleId}"`]);
        return rows;
    },

    /**
     * Updates the stored Discord roles for a user across all their characters.
     * @param {string} discordId - The user's Discord ID.
     * @param {string[]} roles - An array of role IDs.
     */
    updateUserRoles: async (discordId, roles) => {
        const rolesJson = JSON.stringify(roles);
        const sql = 'UPDATE users SET roles = ? WHERE discord_id = ?';
        await db.query(sql, [rolesJson, discordId]);
    },

    /**
     * Clears the stored Discord roles for a user.
     * @param {string} discordId - The user's Discord ID.
     * @returns {Promise<boolean>}
     */
    clearUserRoles: async (discordId) => {
        try {
            const rolesJson = JSON.stringify([]);
            const sql = 'UPDATE users SET roles = ? WHERE discord_id = ?';
            await db.query(sql, [rolesJson, discordId]);
            return true;
        } catch (error) {
            logger.error(`Failed to clear roles for ${discordId}:`, error);
            return false;
        }
    },

    /**
     * Gets all registered users with a main character.
     * @returns {Promise<Array<{discord_id: string}>>}
     */
    getAllUsers: async () => {
        const sql = 'SELECT DISTINCT discord_id FROM users WHERE is_main = 1';
        return await db.query(sql);
    },

    /*
    * Get discord ID and main character name by alt character name.
    * @param {string} altName - The name of the alt character.
    * @returns {Promise<{discord_id: string, character_name: string}|null>}
    */
    getMainCharacterByAlt: async (altName) => {
        const sql = 'SELECT discord_id, character_name FROM users WHERE discord_id = (SELECT discord_id FROM users WHERE character_name = ?) AND is_main = 1';
        return await db.query(sql, [altName]);
    }
};

