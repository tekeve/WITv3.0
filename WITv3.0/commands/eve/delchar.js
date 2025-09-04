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
        let discordUsername = interaction.user.username;
        let discordMember = interaction.member;

        if (targetUser && hasAdminRole(interaction.member)) {
            discordId = targetUser.id;
            discordUsername = targetUser.username;
            discordMember = await interaction.guild.members.fetch(targetUser.id);
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to modify other users\' characters.', flags: [MessageFlags.Ephemeral] });
        }

        const result = await charManager.deleteChar(discordId, charName);

        // If an alt was deleted (not the main), the user record still exists.
        // This is a good time to update their roles.
        if (result.success && !result.message.includes('Main character')) {
            const userRoles = discordMember.roles.cache.map(role => role.name);
            await charManager.updateUserRoles(discordId, userRoles);
        }

        if (result.success) {
            await interaction.reply({ content: `${result.message} for ${discordUsername}. Roles have been synced.`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `Error: ${result.message}`, flags: [MessageFlags.Ephemeral] });
        }
    },
};

