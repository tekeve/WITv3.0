const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permission: 'commander',
    data: new SlashCommandBuilder()
        .setName('logi')
        .setDescription('Generates a unique link to the logistics sign-off management page.'),
    async execute(interaction) {
        // Ensure the user has the commander role
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You must be a Commander to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const token = uuidv4();

        if (!interaction.client.activeLogiTokens) {
            interaction.client.activeLogiTokens = new Map();
        }

        interaction.client.activeLogiTokens.set(token, {
            user: interaction.user,
            member: interaction.member,
            guildId: interaction.guild.id
        });

        const EXPIRATION_MINUTES = 60;
        setTimeout(() => {
            if (interaction.client.activeLogiTokens.has(token)) {
                logger.warn(`Logi Signoff Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeLogiTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/logi/${token}`;

        await interaction.reply({
            content: `Click the button below to open the Logi Sign-off page. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Logi Sign-off Form',
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
