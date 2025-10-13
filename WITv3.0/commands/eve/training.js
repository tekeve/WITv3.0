const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['commander'],
    data: new SlashCommandBuilder()
        .setName('training')
        .setDescription('Access the commander training program tools.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('tracker')
                .setDescription('Opens the Commander Training Progress tracker web UI.')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'tracker') {
            const token = uuidv4();

            if (!interaction.client.activeTrainingTokens) {
                interaction.client.activeTrainingTokens = new Map();
            }

            const EXPIRATION_MINUTES = 120; // 2 hours
            const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

            interaction.client.activeTrainingTokens.set(token, {
                user: interaction.user,
                member: interaction.member,
                guildId: interaction.guild.id,
                expires: expiryTimestamp
            });

            // Clean up the token after it expires
            setTimeout(() => {
                if (interaction.client.activeTrainingTokens.has(token)) {
                    logger.warn(`Training Tracker Token ${token} for ${interaction.user.tag} has expired.`);
                    interaction.client.activeTrainingTokens.delete(token);
                }
            }, EXPIRATION_MINUTES * 60 * 1000);

            const formUrl = `http://${process.env.HOST_NAME}/training/${token}`;

            await interaction.reply({
                content: `Click the button below to open the **Commander Training Tracker**. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
                components: [
                    {
                        type: 1, // Action Row
                        components: [
                            {
                                type: 2, // Button
                                label: 'Open Training Tracker',
                                style: 5, // Link Style
                                url: formUrl
                            }
                        ]
                    }
                ],
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};
