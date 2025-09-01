const { SlashCommandBuilder } = require('discord.js');
// NEW: Import the allowed roles from your config file.
const { incursionRoles } = require('../../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('incursion')
        .setDescription('Manually refreshes the EVE Online Incursion information.'),

    async execute(interaction) {
        // NEW: Check if the user has one of the allowed roles.
        const hasPermission = interaction.member.roles.cache.some(role => incursionRoles.includes(role.name));

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // The rest of the command logic remains the same.
        await interaction.deferReply();

        await interaction.client.updateIncursions(true);

        await interaction.editReply({ content: 'Incursion data has been manually refreshed!' });
    },
};