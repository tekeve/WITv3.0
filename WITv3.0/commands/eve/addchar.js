const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { adminRoles } = require('../../config.js');

// Helper function to check for admin roles
const hasAdminRole = (member) => member.roles.cache.some(role => adminRoles.includes(role.name));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addchar')
        .setDescription('Add a character to your profile.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('main')
                .setDescription('Register your main character.')
                .addStringOption(option => option.setName('name').setDescription('Your main character\'s name').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to add the character for.')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Register an alt character.')
                .addStringOption(option => option.setName('name').setDescription('Your alt character\'s name').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to add the character for.'))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const charName = interaction.options.getString('name');
        const targetUser = interaction.options.getUser('user');
        const member = interaction.member;

        let discordUser = interaction.user;
        let discordMember = member;

        // Admin override logic
        if (targetUser && hasAdminRole(member)) {
            discordUser = targetUser;
            discordMember = await interaction.guild.members.fetch(targetUser.id);
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to modify other users\' characters.', flags: [MessageFlags.Ephemeral] });
        }

        // Get the current roles to be saved or updated
        const userRoles = discordMember.roles.cache.map(role => role.name);

        if (subcommand === 'main') {
            const success = await charManager.addMain(discordUser.id, charName, userRoles);
            if (success) {
                await interaction.reply({ content: `Main character **${charName}** has been registered for ${discordUser.username}. Their roles have also been updated.`, flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: `There was a database error while registering **${charName}**.`, flags: [MessageFlags.Ephemeral] });
            }
        } else if (subcommand === 'alt') {
            const result = await charManager.addAlt(discordUser.id, charName);
            if (result.success) {
                // Also update the roles when an alt is added successfully
                await charManager.updateUserRoles(discordUser.id, userRoles);
                await interaction.reply({ content: `Alt character **${charName}** has been added for ${discordUser.username}. Their roles have also been updated.`, flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: `Error: ${result.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};

