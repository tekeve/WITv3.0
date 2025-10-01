const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permission: 'admin', // Only admins can initiate setup.
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Generates a link to perform or edit the bot setup (owner-only after first run).'),
    async execute(interaction) {
        const config = configManager.get();
        const isSetupComplete = config && config.setupLocked && config.setupLocked.includes("true");

        // After the first setup, only the server owner or an admin can run this command again.
        if (isSetupComplete && (interaction.user.id !== interaction.guild.ownerId && !roleManager.isAdmin(interaction.member))) {
            return interaction.reply({
                content: 'The initial setup has been completed. Only the server owner or an Admin can run this command again to edit the configuration.',
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
        const formUrl = `http://${process.env.HOST_NAME}/setup/${token}`;
        const actionWord = isSetupComplete ? "Edit Configuration" : "Open Setup Form";

        // Reply to the user with a button linking to the form
        await interaction.reply({
            content: `Click the button below to open the bot setup form. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: actionWord,
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
