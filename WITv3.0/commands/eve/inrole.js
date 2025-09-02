const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
// Import the new aliases from the config file
const { roleAliases } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('Lists the main characters of users with a specific Discord role or alias.')
        .addStringOption(option => option.setName('role').setDescription('The name of the Discord role or alias to look up').setRequired(true)),

    async execute(interaction) {
        const userInput = interaction.options.getString('role');

        // Check if the user's input matches an alias. Default to the original input if no alias is found.
        const targetRoleName = roleAliases[userInput.toLowerCase()] || userInput;

        const users = charManager.findUsersInRole(targetRoleName);

        if (users.length === 0) {
            return interaction.reply({ content: `No registered users found with the role **${targetRoleName}**.`});
        }

        const charList = users.map(user => `• ${user.mainChar}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            // Use the resolved role name in the title for clarity
            .setTitle(`Main Characters with Role: ${targetRoleName}`)
            .setDescription(charList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};