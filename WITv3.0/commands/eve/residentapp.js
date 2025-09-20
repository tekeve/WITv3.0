const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'public', // Or any other permission level
    data: new SlashCommandBuilder()
        .setName('residentapp')
        .setDescription('Generates a unique link to the resident application form.'),
    async execute(interaction) {
        const token = uuidv4();

        // Ensure the token map exists on the client
        if (!interaction.client.activeResidentAppTokens) {
            interaction.client.activeResidentAppTokens = new Map();
        }

        interaction.client.activeResidentAppTokens.set(token, {
            interaction: interaction,
            user: interaction.user
        });

        const EXPIRATION_MINUTES = 60;
        setTimeout(() => {
            if (interaction.client.activeResidentAppTokens.has(token)) {
                logger.warn(`Resident App Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeResidentAppTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.WEB_HOST_NAME || 'localhost:3000'}/residentapp/${token}`;

        await interaction.reply({
            content: `Click the button below to open the Resident Application form. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Application Form',
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

