const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Generates a unique link to manage reaction roles.'),
    async execute(interaction) {
        const token = uuidv4();

        if (!interaction.client.activeReactionRoleTokens) {
            interaction.client.activeReactionRoleTokens = new Map();
        }

        interaction.client.activeReactionRoleTokens.set(token, {
            user: interaction.user,
            guild: interaction.guild,
            interaction: interaction
        });

        const EXPIRATION_MINUTES = 60;
        setTimeout(() => {
            if (interaction.client.activeReactionRoleTokens.has(token)) {
                logger.warn(`Reaction Role Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeReactionRoleTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/reactionroles/${token}`;

        await interaction.reply({
            content: `Click the button below to open the Reaction Roles management page. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Reaction Roles Manager',
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
