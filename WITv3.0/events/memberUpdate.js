const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const actionLog = require('@helpers/actionLog');
const logger = require('@helpers/logger');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        if (!newMember.guild) return;

        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        // Proceed only if the roles have actually changed.
        if (oldRoles.size === newRoles.size && oldRoles.every((role, id) => newRoles.has(id))) {
            return; // No role changes, exit early.
        }

        try {
            const fetchedLogs = await newMember.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberRoleUpdate,
            });
            const roleLog = fetchedLogs.entries.first();

            // Verify the audit log is recent and for the correct user.
            if (!roleLog || roleLog.target.id !== newMember.id || roleLog.createdTimestamp < (Date.now() - 5000)) {
                logger.warn(`Could not find a recent audit log for a role change for ${newMember.user.tag}. This may be a self-role change.`);
                return;
            }

            const { executor, changes } = roleLog;

            // Determine which roles were added and which were removed from the audit log entry.
            const addedRoles = changes.filter(change => change.key === '$add').flatMap(change => change.new);
            const removedRoles = changes.filter(change => change.key === '$remove').flatMap(change => change.new);

            // If no roles were added or removed in the log, something is wrong, so we exit.
            if (addedRoles.length === 0 && removedRoles.length === 0) {
                return;
            }

            // --- MODIFICATION START ---
            // Combine added and removed roles into a single, comprehensive embed.
            const embed = new EmbedBuilder()
                .setColor(0x4E5D94) // Neutral blue color
                .setTitle('Member Roles Updated')
                .setDescription(`Roles for **${newMember.user.tag}** were updated by **${executor.tag}**.`)
                .setTimestamp();

            if (addedRoles.length > 0) {
                const addedRolesString = addedRoles.map(role => `<@&${role.id}>`).join('\n');
                embed.addFields({ name: 'Roles Added', value: addedRolesString, inline: true });
                embed.setColor(0x43B581); // Green if roles were added
            }

            if (removedRoles.length > 0) {
                const removedRolesString = removedRoles.map(role => `<@&${role.id}>`).join('\n');
                embed.addFields({ name: 'Roles Removed', value: removedRolesString, inline: true });
                embed.setColor(0xED4245); // Red if roles were removed
            }

            // If both were changed, the color will be red, which is fine as it indicates a change.

            // Post the single, combined log entry.
            actionLog.postLog(newMember.guild, 'log_member_role_add', embed, { member: newMember });
            // --- MODIFICATION END ---

        } catch (error) {
            logger.error('Failed to process guildMemberUpdate event for role change:', error);
        }
    },
};

