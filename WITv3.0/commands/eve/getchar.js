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

        if (targetUser && hasAdminRole(interaction.member)) {
            discordUser = targetUser;
        } else if (targetUser) {
            return interaction.reply({ content: 'You do not have permission to view other users\' characters.'});
        }

        const charData = charManager.getChars(discordUser.id);

        if (!charData) {
            return interaction.reply({ content: `No characters registered for ${discordUser.username}.`});
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Registered Characters for ${discordUser.username}`)
            .addFields(
                { name: 'Main Character', value: charData.mainChar },
                { name: 'Alts', value: charData.alts.length > 0 ? charData.alts.join('\n') : 'None' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed]});
    },
};