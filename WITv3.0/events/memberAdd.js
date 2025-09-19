const { Events, EmbedBuilder } = require('discord.js');
const { logAction } = require('@helpers/actionLog');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const accountAge = Math.floor(member.user.createdTimestamp / 1000);

        const embed = new EmbedBuilder()
            .setColor(0x57F287) // Green
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setDescription(`${member.user} **joined the server**`)
            .addFields({ name: 'Account Created', value: `<t:${accountAge}:R>` })
            .setFooter({ text: `User ID: ${member.user.id}` })
            .setTimestamp();

        logAction(member.client, embed);
    },
};
