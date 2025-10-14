const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['commander'], // This command is for commanders only
    data: new SlashCommandBuilder()
        .setName('iskstats')
        .setDescription('Generates a link to view fleet statistics (Commanders only).'),

    async execute(interaction) {
        // Permission check for the stats command
        if (!roleManager.hasPermission(interaction.member, ['commander'])) {
            return interaction.reply({
                content: 'You must be a Commander to view fleet statistics.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const token = uuidv4();

        if (!interaction.client.activeIskTokens) {
            interaction.client.activeIskTokens = new Map();
        }

        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        interaction.client.activeIskTokens.set(token, {
            interaction,
            user: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            expires: expiryTimestamp
        });

        setTimeout(() => {
            if (interaction.client.activeIskTokens.has(token)) {
                logger.warn(`ISK Stats Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeIskTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const statsUrl = `http://${process.env.HOST_NAME}/isk/stats/${token}`;

        await interaction.reply({
            content: `Click the button below to open the **ISK/Hour Statistics Dashboard**. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Open Statistics`,
                    style: 5,
                    url: statsUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral]
        });
    }
};
