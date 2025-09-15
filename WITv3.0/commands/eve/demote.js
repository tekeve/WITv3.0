const { SlashCommandBuilder } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Demotes a user or removes all their roles.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to demote.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('The rank to demote the user to, or "Remove All Roles".')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        // Fetch ranks and include the special "Remove All" option.
        const ranks = await roleHierarchyManager.getRankNames();
        const specialOption = 'Remove All Roles';
        const choices = [specialOption, ...ranks];

        const focusedValue = interaction.options.getFocused();
        const filtered = choices.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase())).slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    },

    async execute(interaction) {
        await roleManager.manageRoles(interaction, 'demote');
    },
};

