const { MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');
const db = require('@helpers/database'); // Import database helper for direct queries

/**
 * Renders the Setup form, pre-filling it with existing data if available.
 * @param {Map<string, any>} activeSetupTokens - The map storing valid tokens.
 * @returns An async function to handle the GET request.
 */
exports.showSetupForm = (activeSetupTokens) => async (req, res) => {
    const { token } = req.params;

    if (!activeSetupTokens.has(token)) {
        logger.warn(`Invalid or expired setup token used: ${token}`);
        return res.status(404).render('error', {
            title: 'Link Invalid or Expired',
            message: 'This setup form link is no longer valid. Please generate a new one using the /setup command in Discord.',
        });
    }

    try {
        const dbConfig = await db.query('SELECT key_name, value FROM config');
        const currentConfig = {};

        // Process the database rows to pre-fill the form
        for (const row of dbConfig) {
            try {
                // Values are stored as JSON arrays, e.g., '["123", "456"]'
                const parsedValue = JSON.parse(row.value);
                // Join array elements to create a comma-separated string for the form input
                if (Array.isArray(parsedValue)) {
                    currentConfig[row.key_name] = parsedValue.join(', ');
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

    // Invalidate the token immediately to prevent double submissions
    activeSetupTokens.delete(token);

    try {
        const { interaction } = setupData;
        const formData = req.body;

        logger.info('Processing setup form submission...');

        // Save each piece of configuration to the database
        for (const [key, value] of Object.entries(formData)) {
            // Treat all incoming values as potentially comma-separated and store as a JSON array string.
            const arrayValue = value.split(',').map(item => item.trim()).filter(Boolean);
            const valueToStore = JSON.stringify(arrayValue);

            // Using ON DUPLICATE KEY UPDATE handles both initial setup and subsequent edits.
            const sql = 'INSERT INTO config (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?';
            await db.query(sql, [key, valueToStore, valueToStore]);
        }

        // Mark the setup as complete (or re-affirm it)
        const lockSql = 'INSERT INTO config (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?';
        await db.query(lockSql, ['setupLocked', JSON.stringify(["true"]), JSON.stringify(["true"])]);


        logger.success('All configuration from setup form has been saved.');

        // Reload the config in the bot
        await configManager.reloadConfig();
        logger.success('Live configuration has been reloaded.');

        await interaction.followUp({
            content: 'Your setup has been successfully submitted and applied!',
            flags: [MessageFlags.Ephemeral]
        });

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
