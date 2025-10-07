const db = require('@helpers/database');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');

// A set of fields that are allowed to be updated via the web UI
const allowedFields = new Set([
    'start_date', 'last_active', 'resident_orientation_by',
    'quiz_scouting', 'quiz_fitting', 'quiz_fleet_roles', 'quiz_site_mechanics',
    'signoff_scouting_by', 'signoff_trusted_logi', 'signoff_bastion', 'signoff_new_pilot_orientation_by',
    'exam_multiple_choice', 'exam_ct'
]);

/**
 * Fetches all pilots from the commander_training table.
 * @returns {Promise<Array<object>>} A list of pilots with their training progress.
 */
async function getAllPilots() {
    try {
        const pilots = await db.query('SELECT * FROM commander_training ORDER BY pilot_name ASC');
        // Process fields that are stored as JSON strings into actual arrays
        pilots.forEach(pilot => {
            pilot.signoff_scouting_by = pilot.signoff_scouting_by ? JSON.parse(pilot.signoff_scouting_by) : [];
            pilot.signoff_new_pilot_orientation_by = pilot.signoff_new_pilot_orientation_by ? JSON.parse(pilot.signoff_new_pilot_orientation_by) : [];
            pilot.comments = pilot.comments ? JSON.parse(pilot.comments) : [];
        });
        return pilots;
    } catch (error) {
        logger.error('Failed to get all pilots from training tracker:', error);
        return [];
    }
}

/**
 * Adds a new resident to the training program.
 * @param {string} pilotName - The EVE character name of the pilot.
 * @param {string} discordId - The Discord ID of the user.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addResident(pilotName, discordId) {
    try {
        // Check if the user is already in the training program
        const [existing] = await db.query('SELECT * FROM commander_training WHERE discord_id = ? OR pilot_name = ?', [discordId, pilotName]);
        if (existing) {
            return { success: false, message: 'This user or pilot name is already in the training program.' };
        }

        // Register them as a main character if they aren't already
        const charData = await charManager.getChars(discordId);
        if (!charData || !charData.main) {
            await charManager.addMain(discordId, pilotName, []);
            logger.info(`Auto-registered ${pilotName} as a main character for discord ID ${discordId}`);
        }

        // Add to the training table with today's date as start and last active
        const sql = 'INSERT INTO commander_training (pilot_name, discord_id, start_date, last_active) VALUES (?, ?, CURDATE(), CURDATE())';
        const result = await db.query(sql, [pilotName, discordId]);

        if (result.affectedRows > 0) {
            return { success: true, message: `Successfully added ${pilotName} to the training tracker.` };
        } else {
            return { success: false, message: 'Failed to add pilot to the database.' };
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, message: `A pilot with the name ${pilotName} or a user with that Discord ID is already in the training program.` };
        }
        logger.error(`Error adding resident ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

/**
 * Updates a specific field for a pilot in the training tracker.
 * @param {number} pilotId - The database ID of the pilot.
 * @param {string} field - The name of the field to update.
 * @param {any} value - The new value for the field.
 * @param {string} commanderName - The name of the commander making the change.
 * @returns {Promise<{success: boolean, message: string, lastActive?: string}>}
 */
async function updatePilotProgress(pilotId, field, value, commanderName) {
    if (!allowedFields.has(field)) {
        return { success: false, message: 'Invalid field specified.' };
    }

    const [pilot] = await db.query('SELECT * FROM commander_training WHERE pilot_id = ?', [pilotId]);
    if (!pilot) {
        return { success: false, message: 'Pilot not found.' };
    }

    // Determine if this update should also refresh the 'last_active' date
    const shouldUpdateLastActive = field.startsWith('quiz_') || field.startsWith('signoff_') || field.startsWith('exam_') || field === 'resident_orientation_by';

    try {
        let lastActiveDate = pilot.last_active;
        // Handle fields that store a list of commanders (JSON arrays)
        if (field.endsWith('_by')) {
            let currentSignoffs = [];
            try {
                currentSignoffs = pilot[field] ? JSON.parse(pilot[field]) : [];
                if (!Array.isArray(currentSignoffs)) currentSignoffs = [];
            } catch (e) {
                logger.warn(`Could not parse JSON for ${field} on pilot ${pilotId}. Resetting.`);
                currentSignoffs = [];
            }

            const commanderIndex = currentSignoffs.indexOf(commanderName);
            let actionMessage;

            if (value && commanderIndex === -1) { // Add commander
                currentSignoffs.push(commanderName);
                actionMessage = `Added your sign-off for ${pilot.pilot_name}.`;
            } else if (!value && commanderIndex > -1) { // Remove commander
                currentSignoffs.splice(commanderIndex, 1);
                actionMessage = `Removed your sign-off for ${pilot.pilot_name}.`;
            } else {
                return { success: true, message: 'No changes made to sign-offs.' }; // No change needed
            }

            const updatedValue = JSON.stringify(currentSignoffs);
            const sql = `UPDATE commander_training SET \`${field}\` = ?, last_active = NOW() WHERE pilot_id = ?`;
            await db.query(sql, [updatedValue, pilotId]);
            lastActiveDate = new Date().toISOString();
            return { success: true, message: actionMessage, lastActive: lastActiveDate };

        } else { // Handle simple fields (dates, booleans, text)
            let setClauses = `\`${field}\` = ?`;
            const params = [value];

            if (shouldUpdateLastActive) {
                setClauses += ', last_active = NOW()';
                lastActiveDate = new Date().toISOString();
            }

            params.push(pilotId);
            const sql = `UPDATE commander_training SET ${setClauses} WHERE pilot_id = ?`;
            await db.query(sql, params);

            const friendlyFieldName = field.replace(/_/g, ' ');
            return { success: true, message: `Updated ${friendlyFieldName} for ${pilot.pilot_name}.`, lastActive: lastActiveDate };
        }
    } catch (error) {
        logger.error(`Failed to update pilot progress for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database update failed.' };
    }
}

/**
 * Adds a comment to a pilot's training record.
 * @param {number} pilotId - The database ID of the pilot.
 * @param {string} comment - The comment text.
 * @param {string} commanderName - The name of the commander leaving the comment.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addComment(pilotId, comment, commanderName) {
    if (!pilotId || !comment || !commanderName) {
        return { success: false, message: 'Missing required information for comment.' };
    }

    try {
        const [pilot] = await db.query('SELECT comments FROM commander_training WHERE pilot_id = ?', [pilotId]);
        if (!pilot) {
            return { success: false, message: 'Pilot not found.' };
        }

        let currentComments = [];
        try {
            currentComments = pilot.comments ? JSON.parse(pilot.comments) : [];
            if (!Array.isArray(currentComments)) currentComments = [];
        } catch (e) {
            logger.warn(`Could not parse comments JSON for pilot ${pilotId}. Resetting.`);
            currentComments = [];
        }

        currentComments.push({
            commander: commanderName,
            comment: comment,
            date: new Date().toISOString()
        });

        const sql = 'UPDATE commander_training SET comments = ?, last_active = NOW() WHERE pilot_id = ?';
        await db.query(sql, [JSON.stringify(currentComments), pilotId]);

        return { success: true, message: 'Comment added successfully.' };
    } catch (error) {
        logger.error(`Failed to add comment for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database error while adding comment.' };
    }
}


/**
 * Updates a pilot's trusted logi status. Called by the sync manager.
 * @param {string} pilotName - The EVE character name of the pilot.
 * @param {boolean} isTrusted - The new trusted status.
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function updateTrustedLogiStatus(pilotName, isTrusted) {
    try {
        const sql = 'UPDATE commander_training SET signoff_trusted_logi = ? WHERE pilot_name = ?';
        const result = await db.query(sql, [isTrusted, pilotName]);
        if (result.affectedRows > 0) {
            logger.info(`[TrainingSync] Updated trusted logi status for ${pilotName} to ${isTrusted}.`);
            return { success: true };
        }
        return { success: false, message: 'Pilot not found in training tracker.' };
    } catch (error) {
        logger.error(`Error updating trusted logi status for ${pilotName}:`, error);
        return { success: false, message: 'Database error.' };
    }
}


module.exports = {
    getAllPilots,
    addResident,
    updatePilotProgress,
    addComment,
    updateTrustedLogiStatus
};

