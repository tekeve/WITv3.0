const { Events, EmbedBuilder } = require('discord.js');
const { logAction } = require('@helpers/actionLog');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // Ignore partials, bots, and non-content changes (e.g., embed loading)
        if (oldMessage.partial || newMessage.partial || newMessage.author.bot || oldMessage.content === newMessage.content) {
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Blue
            .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() })
            .setDescription(`**Message edited in ${newMessage.channel}** [Jump to Message](${newMessage.url})`)
            .addFields(
                { name: 'Before', value: oldMessage.content.substring(0, 1024) || '*Empty*' },
                { name: 'After', value: newMessage.content.substring(0, 1024) || '*Empty*' }
            )
            .setFooter({ text: `User ID: ${newMessage.author.id}` })
            .setTimestamp();

        logAction(newMessage.client, embed);
    },
};
