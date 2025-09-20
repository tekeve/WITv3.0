const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'public', // Changed to public to allow initial setup
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Generates a unique link to perform initial bot setup.'),
    async execute(interaction) {
        const config = configManager.get();
        // Check if config exists and if setupLocked is a truthy value
        const isSetupLocked = config && config.setupLocked && config.setupLocked.includes("true");

        if (isSetupLocked) {
            return interaction.reply({
                content: 'The setup command has already been used and is now locked.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Generate a unique token for the setup URL
        const token = uuidv4();

        // Store the token with the interaction object so we can reply to it later
        interaction.client.activeSetupTokens.set(token, {
            interaction: interaction,
            user: interaction.user
        });

        // Set an expiration for the token
        const EXPIRATION_MINUTES = 15;
        setTimeout(() => {
            if (interaction.client.activeSetupTokens.has(token)) {
                logger.warn(`Setup Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeSetupTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000); // 15 minutes in milliseconds

        // Construct the full URL for the setup form
        const formUrl = `http://${process.env.WEB_HOST_NAME}/setup/${token}`;

        // Reply to the user with a button linking to the form
        await interaction.reply({
            content: `Click the button below to open the bot setup form. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Setup Form',
                            style: 5, // Link Style
                            url: formUrl
                        }
                    ]
                }
            ],
            flags: [MessageFlags.Ephemeral]
        });
    },
};

