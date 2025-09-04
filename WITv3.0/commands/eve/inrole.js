const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { roleAliases, roleHierarchy, adminRoles, commanderRoles } = require('../../config');

// Create a set to store unique role names and aliases to avoid duplicates.
const choiceSet = new Set();

// Add all aliases from the config
Object.keys(roleAliases).forEach(alias => {
    choiceSet.add(alias);
});

// Add all canonical role names from the hierarchy
Object.keys(roleHierarchy).forEach(roleName => {
    choiceSet.add(roleName);
});

// Convert the set to the format required by addChoices, and sort it alphabetically.
// Discord has a limit of 25 choices, so we slice it just in case.
const roleChoices = Array.from(choiceSet).sort().slice(0, 25).map(name => ({
    name: name,
    value: name,
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('Lists the main characters of users with a specific Discord role or alias.')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The name of the Discord role or alias to look up')
                .setRequired(true)
                .addChoices(...roleChoices)),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role =>
            commanderRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const userInput = interaction.options.getString('role');

        // Check if the user's input matches an alias. Default to the original input if no alias is found.
        const targetRoleName = roleAliases[userInput.toLowerCase()] || userInput;

        const users = await charManager.findUsersInRole(targetRoleName);

        if (users.length === 0) {
            return interaction.reply({ content: `No registered users found with the role **${targetRoleName}**.` });
        }

        const charList = users.map(user => `• ${user.main_character}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            // Use the resolved role name in the title for clarity
            .setTitle(`Main Characters with Role: ${targetRoleName}`)
            .setDescription(charList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};

