const logger = require('@helpers/logger');
const db = require('@helpers/database');
const srpManager = require('@helpers/srpManager'); // Import the new SRP manager

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

    res.render('srpForm', { token });
};

/**
 * Handles a request from the web form to fetch killmail details.
 * @param {import('discord.js').Client} client - The Discord client.
 * @param {Map<string, any>} activeSrpTokens - The map of active SRP tokens.
 * @returns An async function to handle the POST request.
 */
exports.getKillmailDetails = (client, activeSrpTokens) => async (req, res) => {
    const { token } = req.params;
    const { killmailUrl } = req.body;

    // Validate token to ensure the API endpoint isn't abused
    if (!activeSrpTokens.has(token)) {
        return res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
    }

    if (!killmailUrl) {
        return res.status(400).json({ success: false, message: 'Killmail URL is required.' });
    }

    try {
        const data = await srpManager.processKillmail(killmailUrl);
        if (data) {
            res.json({ success: true, data });
        } else {
            res.status(404).json({ success: false, message: 'Could not find or process the killmail. Please check the link.' });
        }
    } catch (error) {
        logger.error('Error in getKillmailDetails controller:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred while fetching killmail data.' });
    }
};


/**
 * Handles the submission of the SRP form.
 * @param {import('discord.js').Client} client - The Discord client instance.
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
            kill_value, // This is the user-input value
            srpable,
            srp_paid,
            loss_description,
            loot_status,
            processed_killmail_data // NEW: a JSON string of the processed data
        } = req.body;
        const { interaction, user } = srpData;

        let processedKillmail = null;
        try {
            if (processed_killmail_data) {
                processedKillmail = JSON.parse(processed_killmail_data);
            }
        } catch (e) {
            logger.warn('Could not parse processed_killmail_data from form submission.');
        }

        const srpRecord = {
            pilot_name: pilot_name,
            kill_report_link: kill_report_option === 'link' ? kill_report_link : null,
            fc_name: fc_name,
            fc_status: backseat_info,
            backseat_details: backseat_info === 'Other' ? backseat_other_details : null,
            ship_type: ship_type,
            srpable: srpable,
            srp_paid: srp_paid,
            loss_description: loss_description,
            loot_status: loot_status
        };

        const sql = `
            INSERT INTO srp_history 
            (pilot_name, kill_report_link, fc_name, fc_status, backseat_details, ship_type, srpable, srp_paid, loss_description, loot_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = Object.values(srpRecord);

        await db.query(sql, values);
        logger.success(`SRP request for ${pilot_name} has been successfully saved to the database.`);

        logger.success(`SRP request received from ${user.tag} for a ${ship_type}.`);

        // Emit the event with the processed killmail data at the top level
        client.emit('srpSubmission', {
            interaction,
            user,
            formData: req.body,
            processedKillmail // Pass the parsed object at the top level
        });

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
