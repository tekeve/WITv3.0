const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const db = require('@helpers/database');

module.exports = {
    permissions: ['certified_trainer', 'council', 'admin'],
    data: new SlashCommandBuilder()
        .setName('quizmanager')
        .setDescription('Manage commander training quizzes.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Opens the web creator to build a new quiz.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The unique name for your new quiz.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Opens the web editor for an existing quiz.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the quiz to edit.')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        try {
            const quizzes = await db.query('SELECT name FROM quizzes WHERE name LIKE ? ORDER BY name LIMIT 25', [`%${focusedValue}%`]);
            await interaction.respond(
                quizzes.map(quiz => ({ name: quiz.name, value: quiz.name }))
            );
        } catch (error) {
            logger.error('Autocomplete for /quizmanager failed:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const quizName = interaction.options.getString('name');
        const guild = interaction.guild;
        const mode = subcommand; // 'create' or 'edit'

        // Verify the quiz exists for 'edit' mode or doesn't exist for 'create' mode.
        const [existingQuiz] = await db.query('SELECT quiz_id FROM quizzes WHERE name = ?', [quizName]);

        if (mode === 'edit' && !existingQuiz) {
            return interaction.reply({
                content: `A quiz named \`${quizName}\` was not found.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
        if (mode === 'create' && existingQuiz) {
            return interaction.reply({
                content: `A quiz named \`${quizName}\` already exists. Use the \`/quizmanager edit\` command instead.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const token = uuidv4();

        if (!interaction.client.activeQuizManagerTokens) {
            interaction.client.activeQuizManagerTokens = new Map();
        }

        interaction.client.activeQuizManagerTokens.set(token, {
            interaction,
            user: interaction.user,
            guild: interaction.guild,
            mode,
            quizId: existingQuiz ? existingQuiz.quiz_id : null,
            quizName: quizName
        });

        const EXPIRATION_MINUTES = 60;
        setTimeout(() => {
            if (interaction.client.activeQuizManagerTokens.has(token)) {
                logger.warn(`Quiz Manager Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeQuizManagerTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        const formUrl = `http://${process.env.HOST_NAME}/quizmanager/${token}`;
        const actionWord = mode.charAt(0).toUpperCase() + mode.slice(1);

        await interaction.reply({
            content: `Click the button below to **${actionWord}** the quiz \`${quizName}\`. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Open Quiz Manager`,
                    style: 5,
                    url: formUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral]
        });
    },
};
