const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const authManager = require('@helpers/authManager');
const logger = require('@helpers/logger');
const esiService = require('@helpers/esiService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maillists')
        .setDescription('Lists your character\'s EVE Online mailing lists and their IDs. (Admin Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Show all mailing lists your authenticated character can access.')),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const authData = await authManager.getUserAuthData(interaction.user.id);
            if (!authData || !authData.character_id) {
                return interaction.editReply({
                    content: 'You must authenticate a character first. Please use `/auth login`.',
                });
            }

            try {
                const accessToken = await authManager.getAccessToken(interaction.user.id);
                const headers = { 'Authorization': `Bearer ${accessToken}` };
                const mailingLists = await esiService.get(`/characters/${authData.character_id}/mail/lists/`, null, headers);

                // --- FIX ---
                // The esiService now returns the data directly, so we don't need 'response.data'.
                if (!Array.isArray(mailingLists)) {
                    // Handle cases where the ESI service returned an error.
                    const errorMessage = mailingLists.message || 'An unknown error occurred.';
                    logger.error(`Failed to fetch EVE mailing lists: ${errorMessage}`);
                    return interaction.editReply({ content: `Could not fetch your mailing lists. ESI responded with an error: \`${errorMessage}\`` });
                }

                if (mailingLists.length === 0) {
                    return interaction.editReply({ content: 'Your character is not subscribed to any mailing lists.' });
                }

                const listString = mailingLists
                    .map(list => `**${list.name}**: \`${list.mailing_list_id}\``)
                    .join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`Mailing Lists for ${authData.character_name}`)
                    .setDescription(listString)
                    .setFooter({ text: 'Use these IDs with the /sendmail command.' });

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                // This catch block is now for unexpected errors, as ESI errors are handled above.
                logger.error(`An unexpected error occurred while fetching mailing lists:`, error);
                await interaction.editReply({ content: `An unexpected error occurred. Please check the logs.` });
            }
        }
    },
};

