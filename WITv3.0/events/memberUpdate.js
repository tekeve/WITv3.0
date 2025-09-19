const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { logAction } = require('@helpers/actionLog');
const logger = require('@helpers/logger');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember, client) { // Added client parameter for explicit access
        // --- DIAGNOSTIC LOG ---
        // This is the most important line. We need to see if this message appears in your console.
        logger.warn(`EVENT FIRED: guildMemberUpdate for user ${newMember.user.tag}`);

        // Fetch the roles from the cache. Using cache is fine here because the event provides the updated member object.
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        // If the role collections are identical, it wasn't a role change.
        if (oldRoles.equals(newRoles)) {
            return;
        }

        try {
            // Delay to allow audit log to populate.
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Fetch the most recent audit log entry for a member role update.
            const fetchedLogs = await newMember.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberRoleUpdate,
            });

            const roleLog = fetchedLogs.entries.first();

            // Validate the audit log entry
            if (!roleLog || roleLog.target.id !== newMember.id || roleLog.createdTimestamp < (Date.now() - 5000)) {
                logger.warn(`Could not find a recent and matching audit log for the role change on ${newMember.user.tag}.`);
                return;
            }

            const { executor, changes } = roleLog;

            const addedRoles = changes.filter(c => c.key === '$add').flatMap(c => c.new.map(r => `<@&${r.id}>`));
            const removedRoles = changes.filter(c => c.key === '$remove').flatMap(c => c.new.map(r => `<@&${r.id}>`));

            if (addedRoles.length === 0 && removedRoles.length === 0) {
                logger.info(`guildMemberUpdate fired for ${newMember.user.tag}, but audit log showed no role changes.`);
                return;
            }

            let description = '';
            if (addedRoles.length > 0) {
                description += `**Roles Added:** ${addedRoles.join(', ')}\n`;
            }
            if (removedRoles.length > 0) {
                description += `**Roles Removed:** ${removedRoles.join(', ')}`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Blue
                .setAuthor({ name: `Roles updated by: ${executor.tag}`, iconURL: executor.displayAvatarURL() })
                .setDescription(`**Roles for ${newMember.user} were updated**\n\n${description.trim()}`)
                .setFooter({ text: `User ID: ${newMember.id}` })
                .setTimestamp();

            // Use the passed client object for logging
            logAction(client, embed);

        } catch (error) {
            logger.error(`Failed to process guildMemberUpdate. Does the bot have 'View Audit Log' permissions?`, error);
        }
    },
};

