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

        let killmail_id = null;
        let killmail_hash = null;

        if (kill_report_option === 'link' && kill_report_link) {
            const match = kill_report_link.match(/killmails\/(\d+)\/([a-f0-9]+)\//);
            if (match) {
                killmail_id = match[1];
                killmail_hash = match[2];
            }
        }

        // --- DATABASE LOGIC GOES HERE ---
        // Example: await db.insertSrpRequest({ userId: user.id, killmail_url, ship_type, details });
        logger.success(`SRP request received from ${user.tag} for a ${ship_type}.`);

        // --- DISCORD BOT EVENT EMITTER ---
        // This is a clean way to send data back to your bot without tightly coupling them.
        // Your bot would listen for this event.
        client.emit('srpSubmission', {
            interaction,
            user,
            formData: {
                pilot_name,
                kill_report_link,
                fc_name,
                backseat_info,
                backseat_other_details,
                ship_type,
                kill_value,
                srpable,
                srp_paid,
                loss_description,
                loot_status,
                kill_report_link,
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
