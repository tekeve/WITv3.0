const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');

module.exports = {
    permissions: ['public'],
    data: new SlashCommandBuilder()
        .setName('loganalysis')
        .setDescription('Generates a unique link to the EVE Online combat log analysis tool.'),

    async execute(interaction) {
        const token = uuidv4();

        if (!interaction.client.activeLogAnalysisTokens) {
            interaction.client.activeLogAnalysisTokens = new Map();
        }

        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        interaction.client.activeLogAnalysisTokens.set(token, {
            interaction,
            user: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            expires: expiryTimestamp
        });

        setTimeout(() => {
            if (interaction.client.activeLogAnalysisTokens.has(token)) {
                logger.warn(`Log Analysis Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeLogAnalysisTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/loganalysis/${token}`;

        await interaction.reply({
            content: `Click the button below to open the **Combat Log Analysis Tool**. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Open Log Analyzer`,
                    style: 5,
                    url: formUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral]
        });
    }
};
