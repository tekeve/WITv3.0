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

                // With the esiService fix, we can be more confident mailingLists is an array if the call succeeds.
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
                // The catch block will now correctly handle errors thrown from the ESI service.
                const errorMessage = error.response?.data?.error || error.message || 'An unknown error occurred.';
                logger.error(`Failed to fetch EVE mailing lists:`, error);
                await interaction.editReply({ content: `Could not fetch your mailing lists. ESI responded with an error: \`${errorMessage}\`` });
            }
        }
    },
};
