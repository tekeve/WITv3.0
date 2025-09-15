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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Register an alt character.')
                .addStringOption(option => option.setName('name').setDescription('Your alt character\'s name').setRequired(true))
        ),

    async execute(interaction) {
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const charName = interaction.options.getString('name');
        const discordUser = interaction.user;
        const discordMember = interaction.member;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let result;
        if (subcommand === 'main') {
            const userRoles = discordMember.roles.cache.map(role => role.id);
            result = await charManager.addMain(discordUser.id, charName, userRoles);
        } else if (subcommand === 'alt') {
            result = await charManager.addAlt(discordUser.id, charName);
        }

        await interaction.editReply({ content: result.message });
    },
};

