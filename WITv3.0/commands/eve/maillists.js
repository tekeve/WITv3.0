const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const authManager = require('../../helpers/authManager.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maillists')
        .setDescription('Lists your character\'s EVE Online mailing lists and their IDs.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Show all mailing lists your authenticated character can access.')),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const authData = authManager.getUserAuthData(interaction.user.id);
            if (!authData) {
                return interaction.editReply({
                    content: 'You must authenticate a character first. Please use `/auth login`.',
                });
            }

            try {
                const accessToken = await authManager.getAccessToken(interaction.user.id);
                const response = await axios.get(
                    `https://esi.evetech.net/latest/characters/${authData.character_id}/mail/lists/`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }
                );

                const mailingLists = response.data;

                if (mailingLists.length === 0) {
                    return interaction.editReply({ content: 'Your character is not subscribed to any mailing lists.' });
                }

                // Format the lists for the embed description
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
                const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                console.error('Failed to fetch EVE mailing lists:', errorMessage);
                await interaction.editReply({ content: `Could not fetch your mailing lists. The ESI might be down or your token may be invalid. Please try re-authenticating with \`/auth login\`.` });
            }
        }
    },
};
