const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');
const configManager = require('@helpers/configManager');
const roleManager = require('@helpers/roleManager');

// Get the configuration once.
const config = configManager.get();

// Defensively create the role choices. If config or roleHierarchy is missing, default to an empty array.
const roleChoices = (config && config.roleHierarchy)
    ? Object.keys(config.roleHierarchy)
        .sort()
        .map(roleName => ({
            name: roleName,
            value: roleName,
        }))
        .slice(0, 25)
    : [];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('Lists the main characters of users with a specific Discord role.')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The name of the Discord role to look up')
                .setRequired(true)
                .addChoices(...roleChoices)),

    async execute(interaction) {
        // Use the centralized permission check
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
            });
        }

        const targetRoleName = interaction.options.getString('role');

        const users = await charManager.findUsersInRole(targetRoleName);

        if (users.length === 0) {
            return interaction.reply({ content: `No registered users found with the role **${targetRoleName}**.` });
        }

        const charList = users.map(user => `• ${user.main_character}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Main Characters with Role: ${targetRoleName}`)
            .setDescription(charList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};

