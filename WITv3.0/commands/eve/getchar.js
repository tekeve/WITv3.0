const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { adminRoles } = require('../../config.js');

const hasAdminRole = (member) => member.roles.cache.some(role => adminRoles.includes(role.name));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getchar')
        .setDescription('Displays your registered characters.')
        .addUserOption(option => option.setName('user').setDescription('Admin only: The Discord user to get characters for.')),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');

        let discordUser = interaction.user;
        let discordMember = interaction.member;

        if (targetUser && hasAdminRole(interaction.member)) {
            discordUser = targetUser;
            discordMember = await interaction.guild.members.fetch(targetUser.id);
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to view other users\' characters.', flags: [MessageFlags.Ephemeral] });
        }

        const charData = await charManager.getChars(discordUser.id);

        if (!charData) {
            return interaction.reply({ content: `No characters registered for ${discordUser.username}.`, flags: [MessageFlags.Ephemeral] });
        }

        // Silently update roles in the background whenever this command is run
        const userRoles = discordMember.roles.cache.map(role => role.name);
        await charManager.updateUserRoles(discordUser.id, userRoles);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Registered Characters for ${discordUser.username}`)
            .addFields(
                { name: 'Main Character', value: charData.main_character },
                { name: 'Alts', value: charData.alt_characters.length > 0 ? charData.alt_characters.join('\n') : 'None' }
            )
            .setFooter({ text: 'User roles were synced with the database.' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    },
};

