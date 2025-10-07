const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['commander'],
    data: new SlashCommandBuilder()
        .setName('logi')
        .setDescription('Generates a unique link to the logistics sign-off management page.'),
    async execute(interaction) {
        // Ensure the user has the commander role
        if (!roleManager.hasPermission(interaction.member, module.exports.permissions)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const token = uuidv4();

        if (!interaction.client.activeLogiTokens) {
            interaction.client.activeLogiTokens = new Map();
        }

        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        interaction.client.activeLogiTokens.set(token, {
            user: interaction.user,
            member: interaction.member,
            guildId: interaction.guild.id,
            expires: expiryTimestamp // Store expiry timestamp
        });

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
