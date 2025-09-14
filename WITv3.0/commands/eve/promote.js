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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promotes a user to a specified role. (Admin Only)')
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

