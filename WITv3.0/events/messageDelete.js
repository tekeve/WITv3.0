const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const actionLog = require('@helpers/actionLog');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || !message.author || message.author.bot) return;

        // Fetch audit logs to see who deleted the message.
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        });

        const deleteLog = fetchedLogs.entries.first();
        let executor = "Unknown";
        if (deleteLog) {
            const { executor: logExecutor, target } = deleteLog;
            // Check if the log entry is for the deleted message's author
            if (target.id === message.author.id && deleteLog.createdTimestamp > (Date.now() - 5000)) {
                executor = logExecutor.tag;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245) // Red
            .setTitle('Message Deleted')
            .addFields(
                { name: 'Author', value: message.author.tag, inline: true },
                { name: 'Channel', value: message.channel.toString(), inline: true },
                { name: 'Deleted By', value: executor, inline: true },
                { name: 'Content', value: message.content ? `\`\`\`${message.content}\`\`\`` : '*No content (e.g., an embed)*' }
            )
            .setTimestamp();

        actionLog.postLog(message.guild, 'log_message_delete', embed, { channel: message.channel, member: message.member });
    },
};

