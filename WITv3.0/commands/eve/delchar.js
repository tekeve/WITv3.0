const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delchar')
        .setDescription('Delete a character from your profile.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('main')
                .setDescription('Deletes your main character and entire profile.')
                .addStringOption(option => option.setName('name').setDescription('The name of your main character to confirm deletion').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to delete the character from.')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Deletes an alt character from your profile.')
                .addStringOption(option => option.setName('name').setDescription('The name of the alt character to delete').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to delete the character from.'))),

    async execute(interaction) {
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const charName = interaction.options.getString('name');
        const targetUser = interaction.options.getUser('user');
        const member = interaction.member;

        let discordUser = interaction.user;
        let discordMember = member;

        // Admin override logic
        if (targetUser && roleManager.isAdmin(member)) {
            discordUser = targetUser;
            discordMember = await interaction.guild.members.fetch(targetUser.id);
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to modify other users\' characters.'});
        }

        let result;
        if (subcommand === 'main') {
            result = await charManager.deleteMain(discordUser.id, charName);
        } else if (subcommand === 'alt') {
            result = await charManager.deleteAlt(discordUser.id, charName);
        }

        if (result.success) {
            // Sync roles after successfully deleting an alt. No sync needed if the whole profile is gone.
            if (subcommand === 'alt') {
                const userRoleIds = discordMember.roles.cache.map(role => role.id);
                await charManager.updateUserRoles(discordUser.id, userRoleIds);
            }
            await interaction.reply({ content: result.message });
        } else {
            await interaction.reply({ content: `Error: ${result.message}`});
        }
    },
};
