const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    // ADD THIS PROPERTY TO ALL COMMAND FILES
    // This makes permissions self-documenting and readable by other parts of the bot.
    permission: 'commander', // Can be 'admin', 'council', 'commander', 'auth', or 'public'

    data: new SlashCommandBuilder()
        .setName('addchar')
        .setDescription('Add a character to a profile.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('main')
                .setDescription('Register a main character.')
                .addStringOption(option => option.setName('name').setDescription('The main character\'s name').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('The user to add the character for (Council only).'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Register an alt character.')
                .addStringOption(option => option.setName('name').setDescription('The alt character\'s name').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('The user to add the character for (Council only).'))
        ),

    async execute(interaction) {
        const targetUserOption = interaction.options.getUser('user');
        const subcommand = interaction.options.getSubcommand();
        const charName = interaction.options.getString('name');

        let effectiveUser;
        let effectiveMember;

        if (targetUserOption) {
            if (!roleManager.isCouncilOrAdmin(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have the required role to manage characters for other users.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            effectiveUser = targetUserOption;
            effectiveMember = await interaction.guild.members.fetch(targetUserOption.id).catch(() => null);
        } else {
            // This command is for commanders to manage their own alts, or admins to manage anyone.
            if (!roleManager.isCommanderOrAdmin(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have the required role to use this command.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            effectiveUser = interaction.user;
            effectiveMember = interaction.member;
        }

        if (!effectiveMember) {
            return interaction.reply({ content: 'Could not find that user in the server.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ ephemeral: true });

        let result;
        if (subcommand === 'main') {
            const userRoles = effectiveMember.roles.cache.map(role => role.id);
            result = await charManager.addMain(effectiveUser.id, charName, userRoles);
        } else if (subcommand === 'alt') {
            result = await charManager.addAlt(effectiveUser.id, charName);
        }

        await interaction.editReply({ content: result.message });
    },
};
