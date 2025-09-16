const { SlashCommandBuilder } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');

module.exports = {
    permission: 'council',
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promotes a user to a specified rank.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to promote.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('The rank to promote the user to.')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        // Fetch rank names from the hierarchy for autocomplete suggestions.
        const ranks = await roleHierarchyManager.getRankNames();
        const focusedValue = interaction.options.getFocused();
        const filtered = ranks.filter(rank => rank.toLowerCase().startsWith(focusedValue.toLowerCase())).slice(0, 25);
        await interaction.respond(
            filtered.map(rank => ({ name: rank, value: rank })),
        );
    },

    async execute(interaction) {
        // All logic is now handled directly by the role manager.
        await roleManager.manageRoles(interaction, 'promote');
    },
};

