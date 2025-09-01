const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const charManager = require('../../helpers/characterManager');
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
            return interaction.reply({ content: 'You do not have permission to modify other users\' characters.'});
        }

        if (subcommand === 'main') {
            // Get all role names for the user
            const userRoles = discordMember.roles.cache.map(role => role.name);
            charManager.addMain(discordUser.id, charName, userRoles);
            await interaction.reply({ content: `Main character **${charName}** has been registered for ${discordUser.username}.`});
        } else if (subcommand === 'alt') {
            const result = charManager.addAlt(discordUser.id, charName);
            if (result.success) {
                await interaction.reply({ content: `Alt character **${charName}** has been added for ${discordUser.username}.`});
            } else {
                await interaction.reply({ content: `Error: ${result.message}`});
            }
        }
    },
};