const { Events, EmbedBuilder } = require('discord.js');
const actionLog = require('@helpers/actionLog');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
        if (oldMessage.content === newMessage.content) return; // Ignore embed updates etc.

        const embed = new EmbedBuilder()
            .setColor(0xFAA61A) // Orange
            .setTitle('Message Edited')
            .addFields(
                { name: 'Author', value: newMessage.author.tag, inline: true },
                { name: 'Channel', value: newMessage.channel.toString(), inline: true },
                { name: 'Original Content', value: oldMessage.content ? `\`\`\`${oldMessage.content}\`\`\`` : '*No content*' },
                { name: 'Updated Content', value: newMessage.content ? `\`\`\`${newMessage.content}\`\`\`` : '*No content*' }
            )
            .setURL(newMessage.url)
            .setTimestamp();

        actionLog.postLog(newMessage.guild, 'log_message_edit', embed, { channel: newMessage.channel, member: newMessage.member });
    },
};

