const { Events, EmbedBuilder } = require('discord.js');
const { logAction } = require('@helpers/actionLog');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        // Ignore partial messages and messages from bots
        if (message.partial || message.author.bot) return;

        const embed = new EmbedBuilder()
            .setColor(0xED4245) // Red
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(`**Message sent by ${message.author} deleted in ${message.channel}**`)
            .addFields({ name: 'Content', value: message.content ? message.content.substring(0, 1024) : '*No content available (e.g., an embed)*' })
            .setFooter({ text: `User ID: ${message.author.id}` })
            .setTimestamp();

        logAction(message.client, embed);
    },
};
