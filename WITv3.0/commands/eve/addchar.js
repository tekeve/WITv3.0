const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

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
        // Use the centralized permission check
        if (!roleManager.isCommander(interaction.member)) {
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

        if (subcommand === 'main') {
            const userRoles = discordMember.roles.cache.map(role => role.name);
            await charManager.addMain(discordUser.id, charName, userRoles);
            await interaction.reply({ content: `Main character **${charName}** has been registered for ${discordUser.username}.`});
        } else if (subcommand === 'alt') {
            const result = await charManager.addAlt(discordUser.id, charName);
            if (result.success) {
                // Sync roles on alt add
                const userRoles = discordMember.roles.cache.map(role => role.name);
                await charManager.updateUserRoles(discordUser.id, userRoles);
                await interaction.reply({ content: `Alt character **${charName}** has been added for ${discordUser.username}.`});
            } else {
                await interaction.reply({ content: `Error: ${result.message}`});
            }
        }
    },
};

