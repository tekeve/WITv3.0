const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['resident', 'admin'], // Accessible to residents and higher
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Access the commander training quizzes.'),
    async execute(interaction) {
        // Generate a unique, single-use token for the web link.
        const token = uuidv4();

        // Create the token map on the client if it doesn't exist
        if (!interaction.client.activeQuizTokens) {
            interaction.client.activeQuizTokens = new Map();
        }

        // Store the token with the user's info.
        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        interaction.client.activeQuizTokens.set(token, {
            user: interaction.user,
            member: interaction.member,
            guildId: interaction.guild.id,
            expires: expiryTimestamp
        });

        // Clean up the token after it expires to prevent memory leaks.
        setTimeout(() => {
            if (interaction.client.activeQuizTokens.has(token)) {
                logger.warn(`Quiz Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeQuizTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000);

        // Construct the URL and send it to the user.
        const formUrl = `http://${process.env.HOST_NAME}/quiz/${token}`;

        await interaction.reply({
            content: `Click the button below to open the Quiz Portal. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            label: 'Open Quiz Portal',
                            style: 5, // Link Style
                            url: formUrl
                        }
                    ]
                }
            ],
            flags: [MessageFlags.Ephemeral] // Only visible to the user who ran the command.
        });
    },
};
