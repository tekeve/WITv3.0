const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');

module.exports = {
    permissions: ['leadership', 'admin'],
    data: new SlashCommandBuilder()
        .setName('actionlog')
        .setDescription('Manage the action log settings.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('Generates a unique link to the action log configuration page.')
        ),
    async execute(interaction) {
        const token = uuidv4();

        // Use a consistent name for the token map
        if (!interaction.client.activeActionLogTokens) {
            interaction.client.activeActionLogTokens = new Map();
        }

        interaction.client.activeActionLogTokens.set(token, {
            user: interaction.user,
            guild: interaction.guild
        });

        const EXPIRATION_MINUTES = 15;
        setTimeout(() => {
            if (interaction.client.activeActionLogTokens.has(token)) {
                logger.warn(`ActionLog Settings Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeActionLogTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/actionlog/${token}`;

        await interaction.reply({
            content: `Click the button below to open the Action Log settings page. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Settings',
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

