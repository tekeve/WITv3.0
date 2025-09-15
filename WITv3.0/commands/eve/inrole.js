const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
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
        await interaction.deferReply();

        const users = await charManager.findUsersInRole(targetRole.id);

        if (users.length === 0) {
            return interaction.editReply({ content: `No registered users found with the role **${targetRole.name}**.` });
        }

        const charList = users.map(user => `• ${user.main_character_name}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(targetRole.color)
            .setTitle(`Main Characters with Role: ${targetRole.name}`)
            .setDescription(charList)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

