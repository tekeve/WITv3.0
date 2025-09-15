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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('alt')
                .setDescription('Deletes an alt character from your profile.')
                .addStringOption(option => option.setName('name').setDescription('The name of the alt character to delete').setRequired(true))
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

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let result;
        if (subcommand === 'main') {
            result = await charManager.deleteMain(discordUser.id, charName);
        } else if (subcommand === 'alt') {
            result = await charManager.deleteAlt(discordUser.id, charName);
        }

        await interaction.editReply({ content: result.message });
    },
};

