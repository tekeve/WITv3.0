const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');

module.exports = {
    permissions: ['commander'],

    data: new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Search for a user by character name')
        .addStringOption(option => option.setName('name').setDescription('The name of the character for which a user should be searched').setRequired(true)),

    async execute(interaction) {
        const name = interaction.options.getString('name');

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const result = await charManager.getMainCharacterByAlt(name);

        if (!result) {
            return interaction.editReply({
                content: `No main character registered for ${name}.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        return interaction.editReply({
            content: `The main character for character \`${name}\` is \`${result.character_name}\` (Discord: \`${result.discord_id}\`).`,
            flags: [MessageFlags.Ephemeral]
        })
    },
}
