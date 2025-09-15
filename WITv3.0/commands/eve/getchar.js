const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getchar')
        .setDescription('Displays your registered characters.')
        .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to get characters for.')),

    async execute(interaction) {
        // Use the centralized permission check
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetUser = interaction.options.getUser('user');

        let discordUser = interaction.user;
        let discordMember = interaction.member;

        // Admin override logic, now using the roleManager
        if (targetUser && roleManager.isAdmin(interaction.member)) {
            discordUser = targetUser;
            discordMember = await interaction.guild.members.fetch(targetUser.id);
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to view other users\' characters.'});
        }

        // Update roles in the database every time the command is run.
        const userRoleIds = discordMember.roles.cache.map(role => role.id);
        await charManager.updateUserRoles(discordUser.id, userRoleIds);

        const charData = await charManager.getChars(discordUser.id);

        if (!charData) {
            return interaction.reply({ content: `No characters registered for ${discordUser.username}.` });
        }

        const alts = charData.alt_characters ? JSON.parse(charData.alt_characters) : [];

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Registered Characters for ${discordUser.username}`)
            .addFields(
                { name: 'Main Character', value: charData.main_character || 'Not Set' },
                { name: 'Alts', value: alts.length > 0 ? alts.join('\n') : 'None' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
