const { MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database'); // Import database helper for direct queries
const roleManager = require('@helpers/roleManager'); // Import roleManager for isAdmin check

/**
 * Renders the Setup form, pre-filling it with existing data if available.
 * @param {Map<string, any>} activeSetupTokens - The map storing valid tokens.
 * @returns An async function to handle the GET request.
 */
exports.showSetupForm = (activeSetupTokens) => async (req, res) => {
    const { token } = req.params;
    const tokenData = activeSetupTokens.get(token); // Fetch token data

    if (!tokenData) {
        logger.warn(`Invalid or expired setup token used: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This setup form link is no longer valid. Please generate a new one using the /setup command in Discord.',
        });
    }

    // --- Permission Check ---
    const config = configManager.get(); // Get current config to check setupLocked
    const isSetupComplete = config && config.setupLocked && config.setupLocked.includes("true");
    const member = await tokenData.interaction.guild.members.fetch(tokenData.user.id); // Fetch member object

    // After the first setup, only a bot admin (owner or from user list) can access the form again.
    if (isSetupComplete && !roleManager.isAdmin(member)) {
        activeSetupTokens.delete(token); // Invalidate token as it shouldn't have been generated
        return res.status(403).render('error', {
            title: 'Permission Denied',
            message: 'The initial setup has been completed. Only a bot admin can edit the configuration.',
        });
    }
    // --- End Permission Check ---


    try {
        const dbConfig = await db.query('SELECT key_name, value FROM config');
        const currentConfig = {};

        // Process the database rows to pre-fill the form
        for (const row of dbConfig) {
            // Skip the setupLocked key, it shouldn't be user-editable here
            if (row.key_name === 'setupLocked') continue;

            try {
                // Values are stored as JSON arrays, e.g., '["123", "456"]'
                const parsedValue = JSON.parse(row.value);
                // Join array elements to create a comma-separated string for the form input
                if (Array.isArray(parsedValue)) {
                    currentConfig[row.key_name] = parsedValue.join(', ');
                } else {
                    // Handle non-array values if necessary (though most should be arrays)
                    currentConfig[row.key_name] = parsedValue;
                }
            } catch (e) {
                // If it's not valid JSON (or an empty array string), just use the raw value.
                currentConfig[row.key_name] = row.value;
            }
        }

        // Render the form, passing the token and the current configuration data
        res.render('setupForm', {
            token,
            currentConfig
        });
    } catch (error) {
        logger.error('Error fetching config for setup form:', error);
        res.status(500).render('error', {
            title: 'Database Error',
            message: 'Could not load current configuration from the database.'
        });
    }
};


/**
 * Handles the submission of the Setup form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {Map<string, any>} activeSetupTokens - The map storing valid tokens.
 * @returns An async function to handle the POST request.
 */
exports.handleSetupSubmission = (client, activeSetupTokens) => async (req, res) => {
    const { token } = req.params;
    const setupData = activeSetupTokens.get(token);

    if (!setupData) {
        logger.warn(`Attempted submission with invalid or expired setup token: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This setup form link has expired and cannot be submitted. Please generate a new one.',
        });
    }

    // --- Permission Check (repeated for submission security) ---
    const config = configManager.get();
    const isSetupComplete = config && config.setupLocked && config.setupLocked.includes("true");
    const member = await setupData.interaction.guild.members.fetch(setupData.user.id);

    if (isSetupComplete && !roleManager.isAdmin(member)) {
        activeSetupTokens.delete(token); // Invalidate token
        return res.status(403).render('error', {
            title: 'Permission Denied',
            message: 'Only a bot admin can submit changes after initial setup.',
        });
    }
    // --- End Permission Check ---


    // Invalidate the token immediately to prevent double submissions
    activeSetupTokens.delete(token);

    try {
        const { interaction } = setupData;
        const formData = req.body;

        logger.info('Processing setup form submission...');

        // Save each piece of configuration to the database
        for (const [key, value] of Object.entries(formData)) {
            // Treat all incoming values as potentially comma-separated and store as a JSON array string.
            // Split by comma, trim whitespace, and filter out any empty strings that might result.
            const arrayValue = value.split(',').map(item => item.trim()).filter(item => item !== '');
            const valueToStore = JSON.stringify(arrayValue);

            // Using ON DUPLICATE KEY UPDATE handles both initial setup and subsequent edits.
            const sql = 'INSERT INTO config (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?';
            await db.query(sql, [key, valueToStore, valueToStore]);
        }

        // Mark the setup as complete (or re-affirm it)
        const lockSql = 'INSERT INTO config (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?';
        // Ensure the value stored for setupLocked is a JSON array containing the string "true"
        await db.query(lockSql, ['setupLocked', JSON.stringify(["true"]), JSON.stringify(["true"])]);


        logger.success('All configuration from setup form has been saved.');

        // Reload the config in the bot
        await configManager.reloadConfig();
        logger.success('Live configuration has been reloaded.');

        // Attempt to reply to the original interaction that generated the link
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '✅ Setup/Configuration has been successfully updated!',
                    flags: [MessageFlags.Ephemeral]
                });
            } else {
                // This case should be rare since the command replies before sending the link
                await interaction.reply({
                    content: '✅ Setup/Configuration has been successfully updated!',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        } catch (replyError) {
            logger.error('Failed to send confirmation message to Discord after setup:', replyError);
            // Don't fail the whole request if the Discord reply fails
        }


        // Show a success page to the user
        res.render('success', {
            title: 'Setup Submitted!',
            message: 'Your configuration has been saved. The bot is now using the new settings. You can now close this window.',
        });

    } catch (error) {
        logger.error('Error processing setup submission:', error);
        res.status(500).render('error', {
            title: 'Submission Failed',
            message: 'An internal error occurred while processing your setup request. Please check the logs.',
        });
    }
};
