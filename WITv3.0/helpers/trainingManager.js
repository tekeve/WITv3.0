const db = require('@helpers/database');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');
const configManager = require('@helpers/configManager');

const residentSimpleFields = new Set([
    'last_active', 'resident_orientation_by',
    'signoff_bastion', 'exam_multiple_choice', 'exam_ct'
]);

const residentComplexSignoffFields = new Set([
    'signoff_scouting', 'signoff_new_pilot_orientation'
]);

const tfcSimpleFields = new Set([
    't1_tagging', 't1_voicing', 't1_waitlist',
    't2_situational_awareness', 't2_evacuations',
    'practice_fleet_speed', 'practice_system_awareness',
    'competency_final', 'last_reported_active', 'special_notes'
]);

/**
 * Fetches all pilots and their associated training data.
 * @returns {Promise<object>} An object containing resident and tfc data.
 */
async function getAllTrackerData() {
    try {
        const residentsQuery = `
            SELECT ct.*, GROUP_CONCAT(qc.quiz_id) as completed_quizzes
            FROM commander_training ct
            LEFT JOIN quiz_completions qc ON ct.discord_id = qc.discord_id
            WHERE ct.status = 'resident'
            GROUP BY ct.pilot_id
            ORDER BY ct.pilot_name ASC;
        `;
        const residents = await db.query(residentsQuery);

        const tfcsQuery = `
            SELECT ct.pilot_id, ct.pilot_name, ct.discord_id, ct.last_active, tfc.*, GROUP_CONCAT(qc.quiz_id) as completed_quizzes
            FROM commander_training ct
            JOIN training_fc_tracker tfc ON ct.pilot_id = tfc.pilot_id
            LEFT JOIN quiz_completions qc ON ct.discord_id = qc.discord_id
            WHERE ct.status = 'training_fc'
            GROUP BY ct.pilot_id
            ORDER BY ct.pilot_name ASC;
        `;
        const tfcs = await db.query(tfcsQuery);

        const processPilot = (pilot) => {
            pilot.completed_quizzes = pilot.completed_quizzes ? pilot.completed_quizzes.split(',').map(Number) : [];

            const scoutingSignoffs = pilot.signoff_scouting ? JSON.parse(pilot.signoff_scouting) : [];
            const orientationSignoffs = pilot.signoff_new_pilot_orientation ? JSON.parse(pilot.signoff_new_pilot_orientation) : [];
            const generalComments = pilot.comments ? JSON.parse(pilot.comments) : [];

            const allComments = [
                ...(Array.isArray(generalComments) ? generalComments.map(c => ({ ...c, type: 'General' })) : []),
                ...(Array.isArray(scoutingSignoffs) ? scoutingSignoffs.map(c => ({ ...c, type: 'Scouting' })) : []),
                ...(Array.isArray(orientationSignoffs) ? orientationSignoffs.map(c => ({ ...c, type: 'Orientation' })) : [])
            ].filter(c => c.comment); // Only keep items that have a comment

            allComments.sort((a, b) => new Date(b.date) - new Date(a.date));
            pilot.comments = allComments;

            // Keep original parsed arrays for dots
            pilot.signoff_scouting = Array.isArray(scoutingSignoffs) ? scoutingSignoffs : [];
            pilot.signoff_new_pilot_orientation = Array.isArray(orientationSignoffs) ? orientationSignoffs : [];
        };

        const processTfc = (pilot) => {
            pilot.completed_quizzes = pilot.completed_quizzes ? pilot.completed_quizzes.split(',').map(Number) : [];
            let currentComments = [];
            try {
                currentComments = pilot.comments ? JSON.parse(pilot.comments) : [];
                if (!Array.isArray(currentComments)) currentComments = [];
            } catch { currentComments = []; }

            pilot.comments = currentComments
                .filter(c => c && c.comment)
                .map(c => ({ type: 'TFC', ...c }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        residents.forEach(processPilot);
        tfcs.forEach(processTfc);

        return { residents, tfcs };
    } catch (error) {
        logger.error('Failed to get all tracker data:', error);
        return { residents: [], tfcs: [] };
    }
}

async function addResident(pilotName, discordId) {
    const connection = await db.pool.getConnection(); // Use a connection for transaction
    try {
        await connection.beginTransaction();

        const [existingRows] = await connection.query('SELECT pilot_id FROM commander_training WHERE discord_id = ? OR pilot_name = ?', [discordId, pilotName]);
        if (existingRows.length > 0) {
            await connection.rollback();
            return { success: false, message: 'This user or pilot name is already in the training program.' };
        }

        const charData = await charManager.getChars(discordId);
        if (!charData || !charData.main) {
            // This part doesn't need to be in the transaction as it's a separate concern
            await charManager.addMain(discordId, pilotName, []);
            logger.info(`Auto-registered ${pilotName} as a main character for discord ID ${discordId}`);
        }

        // Explicitly delete any previous quiz completions for this user.
        const [deleteResult] = await connection.query('DELETE FROM quiz_completions WHERE discord_id = ?', [discordId]);
        if (deleteResult.affectedRows > 0) {
            logger.info(`Cleared ${deleteResult.affectedRows} previous quiz completions for user ${discordId} upon re-adding to tracker.`);
        }

        const sql = 'INSERT INTO commander_training (pilot_name, discord_id, start_date, last_active, status) VALUES (?, ?, NOW(), NOW(), \'resident\')';
        const [result] = await connection.query(sql, [pilotName, discordId]);

        await connection.commit();

        return result.affectedRows > 0
            ? { success: true, message: `Successfully added ${pilotName} to the training tracker.` }
            : { success: false, message: 'Failed to add pilot to the database.' };
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return { success: false, message: `A pilot with the name ${pilotName} or a user with that Discord ID is already in the training program.` };
        }
        logger.error(`Error adding resident ${pilotName}:`, error);
        return { success: false, message: 'A database error occurred.' };
    } finally {
        if (connection) connection.release();
    }
}

async function promoteToTfc(discordId, pilotName) {
    const connection = await db.pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check if pilot is already in the commander_training table
        const [existingPilot] = await connection.query('SELECT pilot_id, status FROM commander_training WHERE discord_id = ?', [discordId]);

        let pilotId;

        if (existingPilot) {
            // Pilot is already in the training program
            pilotId = existingPilot.pilot_id;
            if (existingPilot.status === 'training_fc') {
                await connection.rollback();
                return { success: false, message: 'Pilot is already a Training FC.' };
            }
            // Update their status
            await connection.query("UPDATE commander_training SET status = 'training_fc', last_active = NOW() WHERE pilot_id = ?", [pilotId]);
        } else {
            // Pilot is not in the training program, so add them
            await connection.query(
                'INSERT INTO commander_training (pilot_name, discord_id, start_date, last_active, status) VALUES (?, ?, NOW(), NOW(), ?)',
                [pilotName, discordId, 'training_fc']
            );
            // Instead of relying on insertId, fetch the ID we just created to be safe.
            const [newPilot] = await connection.query('SELECT pilot_id FROM commander_training WHERE discord_id = ?', [discordId]);
            if (!newPilot) {
                throw new Error('Failed to retrieve pilot_id after insertion.');
            }
            pilotId = newPilot.pilot_id;
        }

        // Ensure a corresponding entry exists in the tfc tracker
        await connection.query("INSERT INTO training_fc_tracker (pilot_id) VALUES (?) ON DUPLICATE KEY UPDATE pilot_id = pilot_id", [pilotId]);

        await connection.commit();
        return { success: true, message: `${pilotName} has been promoted to Training FC.` };
    } catch (error) {
        await connection.rollback();
        logger.error(`Error promoting user ${discordId} to TFC:`, error);
        return { success: false, message: 'A database error occurred during promotion.' };
    } finally {
        connection.release();
    }
}

async function updateResidentProgress(pilotId, field, value) {
    if (!residentSimpleFields.has(field)) {
        return { success: false, message: 'Invalid field specified for update.' };
    }
    return await updateLastActiveAndField('commander_training', pilotId, field, value);
}

async function updateTfcProgress(pilotId, field, value) {
    if (!tfcSimpleFields.has(field)) {
        return { success: false, message: 'Invalid field specified for update.' };
    }
    const table = (field === 'last_reported_active') ? 'training_fc_tracker' : 'training_fc_tracker';
    const pilotName = await updateLastActive(pilotId);
    if (!pilotName) return { success: false, message: 'Pilot not found.' };

    try {
        const sql = `UPDATE \`${table}\` SET \`${field}\` = ? WHERE pilot_id = ?`;
        await db.query(sql, [value, pilotId]);
        return { success: true, message: `Updated ${field.replace(/_/g, ' ')} for ${pilotName}.` };
    } catch (error) {
        logger.error(`Failed to update TFC progress for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database update failed.' };
    }
}

async function updateLastActive(pilotId) {
    const [pilot] = await db.query('SELECT pilot_name FROM commander_training WHERE pilot_id = ?', [pilotId]);
    if (!pilot) return null;
    await db.query('UPDATE commander_training SET last_active = NOW() WHERE pilot_id = ?', [pilotId]);
    return pilot.pilot_name;
}

async function updateLastActiveAndField(table, pilotId, field, value) {
    const pilotName = await updateLastActive(pilotId);
    if (!pilotName) return { success: false, message: 'Pilot not found.' };
    try {
        const sql = `UPDATE \`${table}\` SET \`${field}\` = ? WHERE pilot_id = ?`;
        await db.query(sql, [value, pilotId]);
        return { success: true, message: `Updated ${field.replace(/_/g, ' ')} for ${pilotName}.` };
    } catch (error) {
        logger.error(`Failed to update progress for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database update failed.' };
    }
}

async function addSignoff(pilotId, field, commanderName, comment, discordId) {
    if (!residentComplexSignoffFields.has(field)) {
        return { success: false, message: 'Invalid sign-off field specified.' };
    }
    try {
        const [pilot] = await db.query(`SELECT pilot_name, \`${field}\` FROM commander_training WHERE pilot_id = ?`, [pilotId]);
        if (!pilot) return { success: false, message: 'Pilot not found.' };

        let currentSignoffs = pilot[field] ? JSON.parse(pilot[field]) : [];
        if (!Array.isArray(currentSignoffs)) currentSignoffs = [];

        if (currentSignoffs.length >= 3) {
            return { success: false, message: 'This skill already has the maximum of 3 sign-offs.' };
        }
        if (currentSignoffs.some(s => s && s.discordId === discordId)) {
            return { success: false, message: 'You have already signed off this pilot for this skill.' };
        }

        currentSignoffs.push({ discordId, commander: commanderName, comment, date: new Date().toISOString() });
        const updatedValue = JSON.stringify(currentSignoffs);
        const sql = `UPDATE commander_training SET \`${field}\` = ?, last_active = NOW() WHERE pilot_id = ?`;
        await db.query(sql, [updatedValue, pilotId]);

        return { success: true, message: `Sign-off for ${pilot.pilot_name} on ${field.replace(/_/g, ' ')} added.` };
    } catch (error) {
        logger.error(`Failed to add sign-off for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database error while adding sign-off.' };
    }
}

async function removeSignoff(pilotId, field, discordId) {
    if (!residentComplexSignoffFields.has(field)) {
        return { success: false, message: 'Invalid sign-off field specified.' };
    }
    try {
        const [pilot] = await db.query(`SELECT pilot_name, \`${field}\` FROM commander_training WHERE pilot_id = ?`, [pilotId]);
        if (!pilot) return { success: false, message: 'Pilot not found.' };

        let currentSignoffs = pilot[field] ? JSON.parse(pilot[field]) : [];
        if (!Array.isArray(currentSignoffs)) currentSignoffs = [];

        const initialLength = currentSignoffs.length;
        const updatedSignoffs = currentSignoffs.filter(s => s && s.discordId !== discordId);

        if (updatedSignoffs.length === initialLength) {
            return { success: false, message: 'Your sign-off was not found for this skill.' };
        }

        const updatedValue = JSON.stringify(updatedSignoffs);
        const sql = `UPDATE commander_training SET \`${field}\` = ?, last_active = NOW() WHERE pilot_id = ?`;
        await db.query(sql, [updatedValue, pilotId]);

        return { success: true, message: `Removed sign-off for ${pilot.pilot_name} on ${field.replace(/_/g, ' ')}.` };
    } catch (error) {
        logger.error(`Failed to remove sign-off for pilotId ${pilotId}:`, error);
        return { success: false, message: 'Database error while removing sign-off.' };
    }
}

async function addComment(pilotId, comment, commanderName, discordId, type) {
    if (!pilotId || !comment || !commanderName || !type) {
        return { success: false, message: 'Missing required information.' };
    }

    const table = type === 'tfc' ? 'training_fc_tracker' : 'commander_training';

    try {
        const [pilot] = await db.query(`SELECT comments FROM ${table} WHERE pilot_id = ?`, [pilotId]);
        if (!pilot) return { success: false, message: 'Pilot not found.' };

        let currentComments = [];
        try {
            currentComments = pilot.comments ? JSON.parse(pilot.comments) : [];
            if (!Array.isArray(currentComments)) currentComments = [];
        } catch (e) { currentComments = []; }

        currentComments.push({ discordId, commander: commanderName, comment, date: new Date().toISOString() });

        await db.query(`UPDATE ${table} SET comments = ? WHERE pilot_id = ?`, [JSON.stringify(currentComments), pilotId]);
        await updateLastActive(pilotId);

        return { success: true, message: 'Comment added successfully.' };
    } catch (error) {
        logger.error(`Failed to add comment for pilotId ${pilotId} in ${table}:`, error);
        return { success: false, message: 'Database error while adding comment.' };
    }
}

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

async function searchEligibleResidents(searchTerm) {
    try {
        const config = configManager.get();
        const commanderRoles = config.commanderRoles || [];
        const residentRoles = config.residentRoles || [];
        const requiredRoleIds = [...commanderRoles, ...residentRoles];

        if (requiredRoleIds.length === 0) {
            logger.warn('searchEligibleResidents: No commander or resident roles are configured. Returning no users.');
            return [];
        }

        const roleChecks = requiredRoleIds.map(() => 'JSON_CONTAINS(u.roles, ?)').join(' OR ');

        let sql;
        let params;
        const baseSql = `
            SELECT u.discord_id, u.character_name
            FROM users u
            LEFT JOIN commander_training ct ON u.discord_id = ct.discord_id
            WHERE u.is_main = 1 
              AND ct.pilot_id IS NULL
              AND (${roleChecks})
        `;

        // JSON_CONTAINS requires the search value to be a JSON string, so we wrap the role IDs in quotes.
        const roleParams = requiredRoleIds.map(id => `"${id}"`);

        if (searchTerm && searchTerm.trim().length > 0) {
            sql = `${baseSql} AND (u.character_name LIKE ? OR u.discord_id LIKE ?) ORDER BY u.character_name ASC LIMIT 25;`;
            params = [...roleParams, `%${searchTerm.trim()}%`, `%${searchTerm.trim()}%`];
        } else {
            sql = `${baseSql} ORDER BY u.character_name ASC LIMIT 25;`;
            params = roleParams;
        }

        const results = await db.query(sql, params);
        return results;
    } catch (error) {
        logger.error('Failed to search for eligible residents:', error);
        return [];
    }
}

async function searchEligibleTfcCandidates(searchTerm) {
    try {
        const config = configManager.get();
        const commanderRoles = config.commanderRoles || [];
        const residentRoles = config.residentRoles || [];
        const lineCommanderRoles = config.lineCommanderRoles || [];
        const requiredRoleIds = [...commanderRoles, ...residentRoles, ...lineCommanderRoles];

        if (requiredRoleIds.length === 0) {
            logger.warn('searchEligibleTfcCandidates: No commander, resident, or line commander roles are configured. Returning no users.');
            return [];
        }

        const roleChecks = requiredRoleIds.map(() => 'JSON_CONTAINS(u.roles, ?)').join(' OR ');

        let sql;
        let params;
        const baseSql = `
            SELECT u.discord_id, u.character_name, ct.pilot_id
            FROM users u
            LEFT JOIN commander_training ct ON u.discord_id = ct.discord_id
            WHERE u.is_main = 1 
              AND (ct.status IS NULL OR ct.status != 'training_fc')
              AND (${roleChecks})
        `;

        const roleParams = requiredRoleIds.map(id => `"${id}"`);

        if (searchTerm && searchTerm.trim().length > 0) {
            sql = `${baseSql} AND (u.character_name LIKE ?) ORDER BY u.character_name ASC LIMIT 25;`;
            params = [...roleParams, `%${searchTerm.trim()}%`];
        } else {
            sql = `${baseSql} ORDER BY u.character_name ASC LIMIT 25;`;
            params = roleParams;
        }

        const results = await db.query(sql, params);
        return results;
    } catch (error) {
        logger.error('Failed to search for eligible TFC candidates:', error);
        return [];
    }
}

async function removePilotFromTraining(pilotId) {
    if (!pilotId) {
        return { success: false, message: 'Pilot ID is required.' };
    }
    const connection = await db.pool.getConnection();
    try {
        await connection.beginTransaction();

        const [pilot] = await connection.query('SELECT pilot_name, discord_id FROM commander_training WHERE pilot_id = ?', [pilotId]);
        if (!pilot) {
            throw new Error('Pilot not found in training tracker.');
        }

        // Also delete any quiz completions associated with the user
        if (pilot.discord_id) {
            await connection.query('DELETE FROM quiz_completions WHERE discord_id = ?', [pilot.discord_id]);
            logger.info(`Deleted quiz completions for ${pilot.pilot_name} (Discord ID: ${pilot.discord_id}).`);
        }

        // Deleting from commander_training will cascade and delete from training_fc_tracker
        const result = await connection.query('DELETE FROM commander_training WHERE pilot_id = ?', [pilotId]);

        await connection.commit();

        if (result[0].affectedRows > 0) {
            logger.info(`Admin deleted pilot ${pilot.pilot_name} (ID: ${pilotId}) from the training tracker.`);
            return { success: true, message: `Successfully removed ${pilot.pilot_name} from the training program.` };
        } else {
            return { success: false, message: 'Pilot was not found in the training tracker.' };
        }
    } catch (error) {
        await connection.rollback();
        logger.error(`Error removing pilot ${pilotId} from training:`, error);
        return { success: false, message: 'A database error occurred during deletion.' };
    } finally {
        connection.release();
    }
}

module.exports = {
    getAllTrackerData,
    addResident,
    promoteToTfc,
    updateResidentProgress,
    updateTfcProgress,
    addComment,
    addSignoff,
    removeSignoff,
    updateLastActive,
    updateTrustedLogiStatus,
    searchEligibleResidents,
    searchEligibleTfcCandidates,
    removePilotFromTraining
};


