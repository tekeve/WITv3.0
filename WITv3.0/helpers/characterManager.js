const db = require('./dbService');

module.exports = {
    addMain: async (discordId, main_character, roles) => {
        const rolesJson = JSON.stringify(roles);
        const sql = 'INSERT INTO commander_list (discord_id, main_character, roles) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE main_character = VALUES(main_character), roles = VALUES(roles)';
        await db.query(sql, [discordId, main_character, rolesJson]);
        return true;
    },

    addAlt: async (discordId, altChar) => {
        const user = await module.exports.getChars(discordId);
        if (!user) {
            return { success: false, message: 'You must register a main character first.' };
        }
        const alts = user.alt_characters ? JSON.parse(user.alt_characters) : [];
        if (alts.includes(altChar)) {
            return { success: false, message: 'That alt is already registered.' };
        }
        alts.push(altChar);
        const altsJson = JSON.stringify(alts);
        const sql = 'UPDATE commander_list SET alt_characters = ? WHERE discord_id = ?';
        await db.query(sql, [altsJson, discordId]);
        return { success: true };
    },

    deleteMain: async (discordId, mainCharNameToConfirm) => {
        const user = await module.exports.getChars(discordId);
        if (!user) {
            return { success: false, message: 'No characters found for this user.' };
        }

        // Confirmation check
        if (user.main_character.toLowerCase() !== mainCharNameToConfirm.toLowerCase()) {
            return { success: false, message: `The provided name "${mainCharNameToConfirm}" does not match the registered main character "${user.main_character}". No changes were made.` };
        }

        const sql = 'DELETE FROM commander_list WHERE discord_id = ?';
        await db.query(sql, [discordId]);
        return { success: true, message: `Main character ${user.main_character} and all associated alts have been deleted.` };
    },

    deleteAlt: async (discordId, altName) => {
        const user = await module.exports.getChars(discordId);
        if (!user) {
            return { success: false, message: 'No characters found for this user.' };
        }

        let alts = user.alt_characters ? JSON.parse(user.alt_characters) : [];
        const initialAltCount = alts.length;
        alts = alts.filter(alt => alt.toLowerCase() !== altName.toLowerCase());

        if (alts.length === initialAltCount) {
            return { success: false, message: `Could not find an alt named ${altName}.` };
        }

        const altsJson = JSON.stringify(alts);
        const sql = 'UPDATE commander_list SET alt_characters = ? WHERE discord_id = ?';
        await db.query(sql, [altsJson, discordId]);
        return { success: true, message: `Alt character ${altName} has been deleted.` };
    },

    getChars: async (discordId) => {
        const sql = 'SELECT * FROM commander_list WHERE discord_id = ?';
        const rows = await db.query(sql, [discordId]);
        return rows[0] || null;
    },

    findUsersInRole: async (roleName) => {
        const sql = 'SELECT main_character, discord_id FROM commander_list WHERE JSON_CONTAINS(roles, ?)';
        const rows = await db.query(sql, [`"${roleName}"`]);
        return rows;
    },

    updateUserRoles: async (discordId, roles) => {
        const rolesJson = JSON.stringify(roles);
        const sql = 'UPDATE commander_list SET roles = ? WHERE discord_id = ?';
        await db.query(sql, [rolesJson, discordId]);
    },

    getAllUsers: async () => {
        const sql = 'SELECT discord_id FROM commander_list';
        const rows = await db.query(sql);
        return rows;
    },
};

