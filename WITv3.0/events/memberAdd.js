const { Events, EmbedBuilder } = require('discord.js');
const actionLog = require('@helpers/actionLog');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        if (!member.guild) return;

        const embed = new EmbedBuilder()
            .setColor(0x43B581) // Green
            .setTitle('Member Joined')
            .setDescription(`${member.user.tag} (${member.id}) has joined the server.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        actionLog.postLog(member.guild, 'log_member_join', embed, { member });
    },
};

