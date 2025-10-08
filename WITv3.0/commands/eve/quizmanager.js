const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const db = require('@helpers/database');

module.exports = {
    permissions: ['certified_trainer', 'council', 'admin'],
    data: new SlashCommandBuilder()
        .setName('quizmanager')
        .setDescription('Opens a web portal to create, edit, and delete quizzes.'),

    async execute(interaction) {
        const token = uuidv4();

        if (!interaction.client.activeQuizManagerTokens) {
            interaction.client.activeQuizManagerTokens = new Map();
        }

        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        interaction.client.activeQuizManagerTokens.set(token, {
            interaction,
            user: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            expires: expiryTimestamp
        });

        setTimeout(() => {
            if (interaction.client.activeQuizManagerTokens.has(token)) {
                logger.warn(`Quiz Manager Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeQuizManagerTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/quizmanager/${token}`;

        await interaction.reply({
            content: `Click the button below to open the **Quiz Management Portal**. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Open Quiz Portal`,
                    style: 5,
                    url: formUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral]
        });
    },
};

