const { SlashCommandBuilder } = require('discord.js');
const { manageRoles } = require('@helpers/roleManager');
const configManager = require('@helpers/configManager');

// Get the configuration once.
const config = configManager.get();

// Defensively create the role choices from the config file.
const roleChoices = (config && config.roleHierarchy)
    ? Object.keys(config.roleHierarchy).map(roleName => ({
        name: roleName,
        value: roleName,
    }))
    : [];

// Add the special option to remove all manageable roles
if (roleChoices.length > 0) {
    roleChoices.push({ name: 'All Roles', value: 'REMOVE_ALL' });
}


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
