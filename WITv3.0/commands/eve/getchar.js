const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getchar')
        .setDescription('Displays registered characters.')
        .addUserOption(option => option.setName('user').setDescription('The Discord user to get characters for (defaults to you).')),

    async execute(interaction) {
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'Could not find that user in the server.', flags: [MessageFlags.Ephemeral] });
        }

        // Update roles in the database every time the command is run.
        const userRoles = targetMember.roles.cache.map(role => role.id);
        await charManager.updateUserRoles(targetUser.id, userRoles);

        const charData = await charManager.getChars(targetUser.id);

        if (!charData || !charData.main) {
            return interaction.reply({ content: `No main character registered for ${targetUser.username}.`, flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setAuthor({ name: `Registered Characters for ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
            .addFields(
                { name: 'Main Character', value: charData.main.character_name },
                { name: 'Alts', value: charData.alts.length > 0 ? charData.alts.map(a => a.character_name).join('\n') : 'None' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    },
};

