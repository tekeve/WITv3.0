const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['admin', 'council', 'commander'],
    data: new SlashCommandBuilder()
        .setName('delchar')
        .setDescription('Delete a character from a profile.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('main')
                .setDescription('Deletes a main character and entire profile.')
                .addStringOption(option => option.setName('name').setDescription('The main character name to confirm deletion').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('The user to delete the character from (Council only).'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Deletes an alt character from a profile.')
                .addStringOption(option => option.setName('name').setDescription('The name of the alt character to delete').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('The user to delete the character from (Council only).'))
        ),

    async execute(interaction) {
        const targetUserOption = interaction.options.getUser('user');
        const subcommand = interaction.options.getSubcommand();
        const charName = interaction.options.getString('name');

        let effectiveUser;

        if (targetUserOption) {
            // If a target is specified, you must have council/admin roles.
            if (!roleManager.hasPermission(interaction.member, ['admin', 'council'])) {
                return interaction.reply({
                    content: 'You do not have the required role to manage characters for other users.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            effectiveUser = targetUserOption;
        } else {
            // If no target, it's a self-action.
            effectiveUser = interaction.user;
        }

        await interaction.deferReply();

        let result;
        if (subcommand === 'main') {
            result = await charManager.deleteMain(effectiveUser.id, charName);
        } else if (subcommand === 'alt') {
            result = await charManager.deleteAlt(effectiveUser.id, charName);
        }

        await interaction.editReply({ content: result.message });
    },
};
