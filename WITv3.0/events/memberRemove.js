const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const actionLog = require('@helpers/actionLog');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        // Ignore partial messages, bots, or messages without a guild
        if (message.partial || !message.guild || !message.author || message.author.bot) return;

        // Default to the author deleting their own message, which is the most common case.
        let executorText = `Author (${message.author.tag})`;

        // Wrap in a try...catch to handle potential missing permissions
        try {
            // Fetch audit logs to see if a moderator deleted the message.
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete,
            });
            const deleteLog = fetchedLogs.entries.first();

            if (deleteLog) {
                const { executor, target } = deleteLog;
                // A moderator deletion is confirmed if the log is recent, for the correct user,
                // AND the executor is not the same person as the message author.
                if (
                    deleteLog.createdTimestamp > (Date.now() - 5000) &&
                    target.id === message.author.id &&
                    executor.id !== message.author.id
                ) {
                    executorText = `Moderator (${executor.tag})`;
                }
            }
        } catch (error) {
            // This will typically fail if the bot lacks 'View Audit Log' permissions.
            // We can log this for debugging but will proceed with the default executor text.
            console.warn(`Could not fetch audit logs for message deletion, likely missing permissions: ${error.message}`);
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245) // Red
            .setTitle('Message Deleted')
            .addFields(
                { name: 'Author', value: message.author.tag, inline: true },
                { name: 'Channel', value: message.channel.toString(), inline: true },
                { name: 'Deleted By', value: executorText, inline: true },
                { name: 'Content', value: message.content ? `\`\`\`${message.content.substring(0, 1000)}\`\`\`` : '*No content (e.g., an embed)*' }
            )
            .setTimestamp();

        actionLog.postLog(message.guild, 'log_message_delete', embed, { channel: message.channel, member: message.member });
    },
};

