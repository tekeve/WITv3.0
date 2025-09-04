const { SlashCommandBuilder } = require('discord.js');
const { manageRoles } = require('../../helpers/roleManager');
const { roleHierarchy } = require('../../config');

// Dynamically create the role choices from the config file
const roleChoices = Object.keys(roleHierarchy).map(roleName => ({
    name: roleName,
    value: roleName,
}));

// Add the special option to remove all manageable roles
roleChoices.push({ name: 'All Roles', value: 'REMOVE_ALL' });


module.exports = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Demotes a user from a specified role. (Admin Only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to demote.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role to demote the user from, or select the remove all option.')
                .setRequired(true)
                .addChoices(...roleChoices)),
    async execute(interaction) {
        await manageRoles(interaction, 'demote');
    },
};

