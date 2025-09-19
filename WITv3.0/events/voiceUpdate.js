const { Events, EmbedBuilder } = require('discord.js');
const { logAction } = require('@helpers/actionLog');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (member.user.bot) return;

        const oldChannel = oldState.channel;
        const newChannel = newState.channel;

        // User joins a voice channel
        if (!oldChannel && newChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x57F287) // Green
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`${member.user} **joined voice channel** ${newChannel}`)
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();
            logAction(member.client, embed);
        }

        // User leaves a voice channel
        else if (oldChannel && !newChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245) // Red
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`${member.user} **left voice channel** ${oldChannel}`)
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();
            logAction(member.client, embed);
        }

        // User moves between voice channels
        else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Blue
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`${member.user} **switched voice channel**`)
                .addFields(
                    { name: 'From', value: `${oldChannel}`, inline: true },
                    { name: 'To', value: `${newChannel}`, inline: true }
                )
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();
            logAction(member.client, embed);
        }
    },
};
