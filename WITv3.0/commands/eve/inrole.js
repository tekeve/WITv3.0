const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');
const configManager = require('@helpers/configManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('Lists the main characters of users with a specific Discord role.')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The Discord role to look up')
                .setRequired(true)),

    async execute(interaction) {
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetRole = interaction.options.getRole('role');

        const users = await charManager.findUsersWithRole(targetRole.id);

        if (users.length === 0) {
            return interaction.reply({ content: `No registered users found with the role **${targetRole.name}**.` });
        }

        const charList = users.map(user => `• ${user.main_character}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Main Characters with Role: ${targetRole.name}`)
            .setDescription(charList)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
