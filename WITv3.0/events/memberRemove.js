const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { logAction } = require('@helpers/actionLog');
const logger = require('@helpers/logger');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (!member.guild) return;

        // Add a small delay to allow the audit log to populate.
        await new Promise(resolve => setTimeout(resolve, 1000));

        let description = `${member.user} **left the server**`;
        let color = 0xFFA500; // Orange for leave

        try {
            const fetchedLogs = await member.guild.fetchAuditLogs({
                limit: 1,
            });

            const latestLog = fetchedLogs.entries.first();

            // Check if a relevant log entry exists and is recent
            if (latestLog && latestLog.target.id === member.id && latestLog.createdTimestamp > (Date.now() - 5000)) {
                if (latestLog.action === AuditLogEvent.MemberKick) {
                    description = `${member.user} **was kicked by ${latestLog.executor}**`;
                    color = 0xED4245; // Red
                    if (latestLog.reason) {
                        description += `\n**Reason:** ${latestLog.reason}`;
                    }
                } else if (latestLog.action === AuditLogEvent.MemberBanAdd) {
                    // This is handled by the guildBanAdd event, so we can ignore it here to avoid double logging.
                    return;
                }
            }
        } catch (error) {
            logger.warn('Could not fetch audit logs for member remove event. This may be due to missing permissions.');
        }


        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setDescription(description)
            .setFooter({ text: `User ID: ${member.user.id}` })
            .setTimestamp();

        logAction(member.client, embed);
    },
};
