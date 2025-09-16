const logger = require('@helpers/logger');
const db = require('@helpers/dbService');

/**
 * Renders the SRP form if the token is valid.
 * @param {Map<string, any>} activeSrpTokens - The map storing valid tokens.
 * @returns An async function to handle the GET request.
 */
exports.showSrpForm = (activeSrpTokens) => async (req, res) => {
    const { token } = req.params;

    if (!activeSrpTokens.has(token)) {
        logger.warn(`Invalid or expired SRP token used: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This SRP form link is no longer valid. Please generate a new one using the /srp command in Discord.',
        });
    }

    // Render the form and pass the token to it so the form `action` can be set correctly
    res.render('srpForm', { token });
};

/**
 * Handles the submission of the SRP form.
 * @param {Client} client - The Discord client instance.
 * @param {Map<string, any>} activeSrpTokens - The map storing valid tokens.
 * @returns An async function to handle the POST request.
 */
exports.handleSrpSubmission = (client, activeSrpTokens) => async (req, res) => {
    const { token } = req.params;
    const srpData = activeSrpTokens.get(token);

    if (!srpData) {
        logger.warn(`Attempted submission with invalid or expired SRP token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This SRP form link has expired and cannot be submitted. Please generate a new one.',
        });
    }

    // Invalidate the token immediately to prevent double submissions
    activeSrpTokens.delete(token);

    try {
        const {
            pilot_name,
            kill_report_link,
            kill_report_option,
            fc_name,
            backseat_info,
            backseat_other_details,
            ship_type,
            kill_value,
            srpable,
            srp_paid,
            loss_description,
            loot_status
        } = req.body;
        const { interaction, user } = srpData;

        // --- DATABASE INSERTION LOGIC START ---

        // 1. Prepare the data object to match the 'srp_history' table columns.
        const srpRecord = {
            pilot_name: pilot_name,
            // Only include the link if the user provided one.
            kill_report_link: kill_report_option === 'link' ? kill_report_link : null,
            fc_name: fc_name,
            // Map form data to the correct table columns.
            fc_status: backseat_info,
            backseat_details: backseat_info === 'Other' ? backseat_other_details : null,
            ship_type: ship_type,
            srpable: srpable,
            srp_paid: srp_paid,
            loss_description: loss_description,
            loot_status: loot_status
        };

        // 2. Define the SQL query with placeholders (?) to prevent SQL injection.
        const sql = `
            INSERT INTO srp_history 
            (pilot_name, kill_report_link, fc_name, fc_status, backseat_details, ship_type, srpable, srp_paid, loss_description, loot_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // 3. Create an array of values in the exact order of the placeholders.
        const values = [
            srpRecord.pilot_name,
            srpRecord.kill_report_link,
            srpRecord.fc_name,
            srpRecord.fc_status,
            srpRecord.backseat_details,
            srpRecord.ship_type,
            srpRecord.srpable,
            srpRecord.srp_paid,
            srpRecord.loss_description,
            srpRecord.loot_status
        ];
        try {
            // 4. Execute the query using your database service.
            await db.query(sql, values);
            logger.success(`SRP request for ${pilot_name} has been successfully saved to the database.`);
        } catch (e) {
            logger.error('Database Fail, SRP Request', e);
        }

        // --- DATABASE INSERTION LOGIC END ---

        let killmail_id = null;
        let killmail_hash = null;

        if (kill_report_option === 'link' && kill_report_link) {
            const match = kill_report_link.match(/killmails\/(\d+)\/([a-f0-9]+)\//);
            if (match) {
                killmail_id = match[1];
                killmail_hash = match[2];
            }
        }

        logger.success(`SRP request received from ${user.tag} for a ${ship_type}.`);

        client.emit('srpSubmission', {
            interaction,
            user,
            formData: {
                pilot_name,
                kill_report_link,
                kill_report_option, 
                fc_name,
                backseat_info,
                backseat_other_details,
                ship_type,
                kill_value,
                srpable,
                srp_paid,
                loss_description,
                loot_status,
                killmail_id,
                killmail_hash
            }
        });

        // Show a success page to the user
        res.render('success', {
            title: 'SRP Request Submitted!',
            message: 'Your request has been received and will be processed shortly. You can now close this window.',
        });

    } catch (error) {
        logger.error('Error processing SRP submission:', error);
        res.status(500).render('error', {
            title: 'Submission Failed',
            message: 'An internal error occurred while processing your SRP request. Please try again later.',
        });
    }
};

