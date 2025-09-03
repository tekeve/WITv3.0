const { SlashCommandBuilder } = require('discord.js');
const { manageRoles } = require('../../helpers/roleManager');
const { roleHierarchy } = require('../../config');

// Dynamically create the role choices from the config file
const roleChoices = Object.keys(roleHierarchy).map(roleName => ({
    name: roleName,
    value: roleName,
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promotes a user to a specified role.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to promote.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role to promote the user to.')
                .setRequired(true)
                .addChoices(...roleChoices)),
    async execute(interaction) {
        await manageRoles(interaction, 'promote');
    },
};
