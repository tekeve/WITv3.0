const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const authManager = require('@helpers/authManager');

module.exports = {
    permissions: ['commander', 'resident', 'line_commander', 'assault_line_commander', 'training_fc', 'fleet_commander', 'training_ct', 'certified_trainer', 'council', 'officer', 'leadership', 'founder', 'admin'],
    data: new SlashCommandBuilder()
        .setName('srp')
        .setDescription('Generates a unique link to file a Ship Replacement Program (SRP) request.'),
    async execute(interaction) {
        // Auth Check: Ensure the user has an authenticated ESI character.
        const authData = await authManager.getUserAuthData(interaction.user.id);
        if (!authData) {
            return interaction.reply({
                content: 'You must have an authenticated ESI character to submit an SRP request, as it is sent via EVE Mail. Please use `/auth login` and try again.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 1. Generate a unique token
        const token = uuidv4();

        // 2. Store the token with user info. `client.activeSrpTokens` was created in server.js
        interaction.client.activeSrpTokens.set(token, {
            interaction: interaction, // Store interaction to reply later
            user: interaction.user
        });

        // 3. **Set a timeout to automatically invalidate the token**
        const EXPIRATION_MINUTES = 30;
        setTimeout(() => {
            if (interaction.client.activeSrpTokens.has(token)) {
                logger.warn(`SRP Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeSrpTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000); // Convert minutes to milliseconds

        // 4. Construct the URL (make sure to use your actual domain)
        const formUrl = `http://${process.env.HOST_NAME}/srp/${token}`;

        // 5. Reply to the user with the link
        await interaction.reply({
            content: `Click the button below to open the SRP form. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open SRP Form',
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
