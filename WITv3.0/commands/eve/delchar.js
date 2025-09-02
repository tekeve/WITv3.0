const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { adminRoles } = require('../../config.js');

const hasAdminRole = (member) => member.roles.cache.some(role => adminRoles.includes(role.name));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delchar')
        .setDescription('Delete a character from your profile.')
        .addStringOption(option => option.setName('name').setDescription('The name of the character to delete').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to delete the character from.')),

    async execute(interaction) {
        const charName = interaction.options.getString('name');
        const targetUser = interaction.options.getUser('user');

        let discordId = interaction.user.id;

        if (targetUser && hasAdminRole(interaction.member)) {
            discordId = targetUser.id;
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to modify other users\' characters.'});
        }

        const result = charManager.deleteChar(discordId, charName);
        if (result.success) {
            await interaction.reply({ content: result.message});
        } else {
            await interaction.reply({ content: `Error: ${result.message}`});
        }
    },
};