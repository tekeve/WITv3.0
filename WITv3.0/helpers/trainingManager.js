const db = require('@helpers/database');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');

const allowedFields = new Set([
    'start_date', 'last_active', 'resident_orientation_by',
    'quiz_scouting', 'quiz_fitting', 'quiz_fleet_roles', 'quiz_site_mechanics',
    'signoff_scouting_by', 'signoff_trusted_logi', 'signoff_bastion', 'signoff_new_pilot_orientation_by',
    'exam_multiple_choice', 'exam_ct'
]);

async function getAllPilots() {
    try {
        const pilots = await db.query('SELECT * FROM commander_training ORDER BY pilot_name ASC');
        // Process JSON fields
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

async function addResident(pilotName, discordId) {
    try {
        // 1. Check if the user is already in the training program
        const [existing] = await db.query('SELECT * FROM commander_training WHERE discord_id = ?', [discordId]);
        if (existing) {
            return { success: false, message: 'This user is already in the training program.' };
        }

        // 2. Register them as a main character if they aren't already
        const charData = await charManager.getChars(discordId);
        if (!charData || !charData.main) {
            // Note: This assumes 'commander' roles are what's needed to be in the training program. Adjust if necessary.
            await charManager.addMain(discordId, pilotName, []);
            logger.info(`Auto-registered ${pilotName} as a main character for discord ID ${discordId}`);
        }

        // 3. Add to the training table
        const sql = 'INSERT INTO commander_training (pilot_name, discord_id, start_date, last_active) VALUES (?, ?, CURDATE(), CURDATE())';
        const result = await db.query(sql, [pilotName, discordId]);

        if (result.affectedRows > 0) {
            return { success: true, message: `Successfully added ${pilotName} to the training tracker.` };
        } else {
            return { success: false, message: 'Failed to add pilot to the database.' };
        }
    } catch (error) {
        // Handle potential duplicate key error on pilot_name if it's unique
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, message: `A pilot with the name ${pilotName} is already in the training program.` };
        }
        logger.error(`Error adding resident ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    }
}

async function updatePilotProgress(pilotId, field, value, commanderName) {
    if (!allowedFields.has(field)) {
        return { success: false, message: 'Invalid field specified.' };
    }

    const [pilot] = await db.query('SELECT * FROM commander_training WHERE pilot_id = ?', [pilotId]);
    if (!pilot) {
        return { success: false, message: 'Pilot not found.' };
    }

    const shouldUpdateLastActive = field.startsWith('quiz_') || field.startsWith('signoff_') || field.startsWith('exam_');

    try {
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

            if (value && commanderIndex === -1) {
                currentSignoffs.push(commanderName);
                actionMessage = `Added your sign-off for ${pilot.pilot_name}.`;
            } else if (!value && commanderIndex > -1) {
                currentSignoffs.splice(commanderIndex, 1);
                actionMessage = `Removed your sign-off for ${pilot.pilot_name}.`;
            } else {
                return { success: true, message: 'No changes made to sign-offs.' };
            }

            const updatedValue = JSON.stringify(currentSignoffs);
            const sql = `UPDATE commander_training SET \`${field}\` = ?, last_active = NOW() WHERE pilot_id = ?`;
            await db.query(sql, [updatedValue, pilotId]);
            return { success: true, message: actionMessage };

        } else {
            let setClauses = `\`${field}\` = ?`;
            const params = [value];

            if (shouldUpdateLastActive) {
                setClauses += ', last_active = NOW()';
            }

            params.push(pilotId);
            const sql = `UPDATE commander_training SET ${setClauses} WHERE pilot_id = ?`;
            await db.query(sql, params);

            const friendlyFieldName = field.replace(/_/g, ' ');
            return { success: true, message: `Updated ${friendlyFieldName} for ${pilot.pilot_name}.` };
        }
    } catch (error) {
        logger.error(`Failed to update pilot progress for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database update failed.' };
    }
}

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

        const sql = 'UPDATE commander_training SET comments = ? WHERE pilot_id = ?';
        await db.query(sql, [JSON.stringify(currentComments), pilotId]);

        return { success: true, message: 'Comment added successfully.' };
    } catch (error) {
        logger.error(`Failed to add comment for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database error while adding comment.' };
    }
}

module.exports = {
    getAllPilots,
    addResident,
    updatePilotProgress,
    addComment
};

