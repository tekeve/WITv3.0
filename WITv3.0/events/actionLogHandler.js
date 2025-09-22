const { Events, EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const actionLog = require('@helpers/actionLog');
const logger = require('@helpers/logger');

// --- Utility Functions ---

/**
 * Fetches the audit log executor for a specific action and target.
 * @param {import('discord.js').Guild} guild - The guild to fetch logs from.
 * @param {import('discord.js').AuditLogEvent} eventType - The type of audit log to fetch.
 * @param {string} targetId - The ID of the object that was actioned upon.
 * @returns {Promise<import('discord.js').User|null>} The user who performed the action, or null.
 */
async function getExecutor(guild, eventType, targetId) {
    try {
        // --- FIX: Fetch more than one log to avoid race conditions ---
        const fetchedLogs = await guild.fetchAuditLogs({
            limit: 5,
            type: eventType,
        });
        // Find the specific log entry for our target.
        const log = fetchedLogs.entries.find(entry => entry.target?.id === targetId);

        // Check if a log was found and it's recent
        if (log && log.createdTimestamp > (Date.now() - 5000)) {
            return log.executor;
        }
    } catch (error) {
        logger.warn(`Could not fetch audit logs for event type ${eventType}, likely missing permissions.`);
    }
    return null;
}

// --- Event Handler Logic ---

async function handleChannelCreate(channel) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder()
        .setColor(0x43B581)
        .setTitle('Channel Created')
        .setDescription(`Channel **#${channel.name}** was created ${executor ? `by **${executor.tag}**` : ''}.`)
        .setTimestamp();
    actionLog.postLog(channel.guild, 'log_channel_create', embed);
}

async function handleChannelDelete(channel) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Channel Deleted')
        .setDescription(`Channel **#${channel.name}** was deleted ${executor ? `by **${executor.tag}**` : ''}.`)
        .setTimestamp();
    actionLog.postLog(channel.guild, 'log_channel_delete', embed);
}

async function handleChannelUpdate(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    const changes = [];
    let permissionChanges = '';

    if (oldChannel.name !== newChannel.name) {
        changes.push(`**Name:** \`${oldChannel.name}\` -> \`${newChannel.name}\``);
    }
    if (oldChannel.topic !== newChannel.topic) {
        changes.push(`**Topic:** \`${oldChannel.topic || 'None'}\` -> \`${newChannel.topic || 'None'}\``);
    }

    // --- FIX: Reworked permission detection for reliability ---
    const oldPerms = oldChannel.permissionOverwrites.cache;
    const newPerms = newChannel.permissionOverwrites.cache;
    const permChanges = [];

    const allOverwriteIds = new Set([...oldPerms.keys(), ...newPerms.keys()]);

    for (const id of allOverwriteIds) {
        const oldO = oldPerms.get(id);
        const newO = newPerms.get(id);

        let target = null;
        try { target = await newChannel.guild.roles.fetch(id); } catch {
            try { target = await newChannel.guild.members.fetch(id); } catch { }
        }

        const targetName = target ? (target.name || target.user.tag) : `Unknown ID (${id})`;

        if (!oldO && newO) {
            permChanges.push(`**+ ${targetName}** (Overwrite Created)`);
            continue;
        }
        if (oldO && !newO) {
            permChanges.push(`**- ${targetName}** (Overwrite Removed)`);
            continue;
        }
        if (oldO && newO && (oldO.allow.bitfield !== newO.allow.bitfield || oldO.deny.bitfield !== newO.deny.bitfield)) {
            const changedPermissions = [];
            const allPermissionFlags = Object.keys(PermissionsBitField.Flags);

            for (const perm of allPermissionFlags) {
                const flag = PermissionsBitField.Flags[perm];
                const oldAllow = oldO.allow.has(flag);
                const newAllow = newO.allow.has(flag);
                const oldDeny = oldO.deny.has(flag);
                const newDeny = newO.deny.has(flag);

                if (oldAllow !== newAllow) {
                    changedPermissions.push(newAllow ? `✅ ${perm} (Allowed)` : `❌ ${perm} (Not Allowed)`);
                }
                if (oldDeny !== newDeny) {
                    changedPermissions.push(newDeny ? `🚫 ${perm} (Denied)` : `⚪ ${perm} (Not Denied)`);
                }
            }
            if (changedPermissions.length > 0) {
                permChanges.push(`**~ ${targetName}**:\n    ${changedPermissions.join('\n    ')}`);
            }
        }
    }

    if (permChanges.length > 0) {
        permissionChanges = permChanges.join('\n');
    }

    if (changes.length === 0 && permissionChanges.length === 0) return;

    const executor = await getExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Channel Updated')
        .setDescription(`Channel ${newChannel} was updated ${executor ? `by **${executor.tag}**` : ''}.`)
        .setTimestamp();

    if (changes.length > 0) {
        embed.addFields({ name: 'General Changes', value: changes.join('\n') });
    }
    if (permissionChanges.length > 0) {
        embed.addFields({ name: 'Permission Changes', value: permissionChanges.substring(0, 1024) });
    }
    actionLog.postLog(newChannel.guild, 'log_channel_update', embed);
}


async function handleGuildBanAdd(ban) {
    const executor = await getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Member Banned')
        .setDescription(`${ban.user.tag} was banned ${executor ? `by **${executor.tag}**` : ''}.\n**Reason:** ${ban.reason || 'No reason provided.'}`)
        .setThumbnail(ban.user.displayAvatarURL())
        .setTimestamp();
    actionLog.postLog(ban.guild, 'log_member_ban', embed);
}

async function handleGuildBanRemove(ban) {
    const executor = await getExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const embed = new EmbedBuilder()
        .setColor(0x43B581)
        .setTitle('Member Unbanned')
        .setDescription(`${ban.user.tag} was unbanned ${executor ? `by **${executor.tag}**` : ''}.`)
        .setThumbnail(ban.user.displayAvatarURL())
        .setTimestamp();
    actionLog.postLog(ban.guild, 'log_member_unban', embed);
}

async function handleInviteCreate(invite) {
    if (!invite.guild) return;
    const embed = new EmbedBuilder()
        .setColor(0x43B581)
        .setTitle('Invite Created')
        .setDescription(`Invite \`${invite.code}\` created by **${invite.inviter.tag}** for channel ${invite.channel}.`)
        .addFields(
            { name: 'Max Uses', value: `${invite.maxUses || 'Infinite'}`, inline: true },
            { name: 'Expires', value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Never', inline: true }
        )
        .setTimestamp();
    actionLog.postLog(invite.guild, 'log_invite_create', embed);
}

async function handleInviteDelete(invite) {
    if (!invite.guild) return;
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Invite Deleted')
        .setDescription(`Invite \`${invite.code}\` for channel ${invite.channel} was deleted.`)
        .setTimestamp();
    actionLog.postLog(invite.guild, 'log_invite_delete', embed);
}

async function handleMemberAdd(member) {
    const embed = new EmbedBuilder()
        .setColor(0x43B581)
        .setTitle('Member Joined')
        .setDescription(`${member.user.tag} (${member.id}) has joined the server.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
    actionLog.postLog(member.guild, 'log_member_join', embed, { member });
}

async function handleMemberRemove(member) {
    const executor = await getExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    const action = executor ? 'kicked' : 'left';
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`Member ${action.charAt(0).toUpperCase() + action.slice(1)}`)
        .setDescription(`${member.user.tag} has ${action} the server ${executor ? `(Kicked by ${executor.tag})` : ''}.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    // New logic to clear roles from the database
    try {
        const userInDb = await charManager.getChars(member.id);
        if (userInDb) {
            const success = await charManager.clearUserRoles(member.id);
            if (success) {
                logger.info(`Cleared database roles for ${member.user.tag} (${member.id}) who left the server.`);
                embed.addFields({ name: 'Database Roles', value: 'Cleared successfully.' });
            } else {
                logger.warn(`Attempted to clear database roles for ${member.user.tag} (${member.id}), but the database operation failed.`);
                embed.addFields({ name: 'Database Roles', value: 'Failed to clear.' });
            }
        }
    } catch (error) {
        logger.error(`Error clearing roles for leaving member ${member.id}:`, error);
    }

    actionLog.postLog(member.guild, 'log_member_leave', embed, { member });
}

async function handleMemberUpdate(oldMember, newMember) {
    if (newMember.user.bot) return;

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    // Check for Timeout changes
    if (oldTimeout !== newTimeout) {
        const executor = await getExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        if (newTimeout && newTimeout > Date.now()) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('Member Timed Out')
                .setDescription(`${newMember.user.tag} was timed out ${executor ? `by **${executor.tag}**` : ''}.`)
                .addFields({ name: 'Expires', value: `<t:${Math.floor(newTimeout / 1000)}:R>` })
                .setTimestamp();
            actionLog.postLog(newMember.guild, 'log_member_timeout', embed, { member: newMember });
        } else {
            const embed = new EmbedBuilder()
                .setColor(0x43B581)
                .setTitle('Member Timeout Removed')
                .setDescription(`The timeout for ${newMember.user.tag} was removed ${executor ? `by **${executor.tag}**` : ''}.`)
                .setTimestamp();
            actionLog.postLog(newMember.guild, 'log_member_timeout', embed, { member: newMember });
        }
    }

    // Check for Nickname changes
    if (oldMember.nickname !== newMember.nickname) {
        const executor = await getExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Nickname Changed')
            .setDescription(`${newMember.user.tag}'s nickname was changed ${executor ? `by **${executor.tag}**` : ''}.`)
            .addFields(
                { name: 'Old Nickname', value: `\`${oldMember.nickname || 'None'}\``, inline: true },
                { name: 'New Nickname', value: `\`${newMember.nickname || 'None'}\``, inline: true }
            )
            .setTimestamp();
        actionLog.postLog(newMember.guild, 'log_nickname_change', embed, { member: newMember });
    }

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Check for Role changes
    if (oldRoles.size !== newRoles.size || !oldRoles.every((value, key) => newRoles.has(key))) {
        const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
        const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

        if (addedRoles.size > 0 || removedRoles.size > 0) {
            const roleExecutor = await getExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            const embed = new EmbedBuilder()
                .setTitle('Member Roles Updated')
                .setDescription(`Roles for **${newMember.user.tag}** were updated ${roleExecutor ? `by **${roleExecutor.tag}**` : ''}.`)
                .setTimestamp();

            if (addedRoles.size > 0) {
                embed.addFields({ name: 'Roles Added', value: addedRoles.map(r => r.toString()).join('\n'), inline: true });
                embed.setColor(0x43B581);
            }
            if (removedRoles.size > 0) {
                embed.addFields({ name: 'Roles Removed', value: removedRoles.map(r => r.toString()).join('\n'), inline: true });
                embed.setColor(0xED4245);
            }
            if (addedRoles.size > 0 && removedRoles.size > 0) {
                embed.setColor(0x4E5D94);
            }
            actionLog.postLog(newMember.guild, 'log_member_role_update', embed, { member: newMember });
        }
    }
}

async function handleMessageDelete(message) {
    if (message.partial || !message.guild || !message.author || message.author.bot) return;

    const executor = await getExecutor(message.guild, AuditLogEvent.MessageDelete, message.author.id);
    let deletedBy = `Author (${message.author.tag})`;
    if (executor && executor.id !== message.author.id) {
        deletedBy = `Moderator (${executor.tag})`;
    }

    if (message.content) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Message Deleted')
            .addFields(
                { name: 'Author', value: message.author.tag, inline: true },
                { name: 'Channel', value: message.channel.toString(), inline: true },
                { name: 'Deleted By', value: deletedBy, inline: true },
                { name: 'Content', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\`` }
            )
            .setTimestamp();
        actionLog.postLog(message.guild, 'log_message_delete', embed, { channel: message.channel, member: message.member });
    }

    if (message.attachments.size > 0) {
        message.attachments.forEach(attachment => {
            if (attachment.contentType?.startsWith('image/')) {
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('Image Deleted')
                    .addFields(
                        { name: 'Author', value: message.author.tag, inline: true },
                        { name: 'Channel', value: message.channel.toString(), inline: true },
                        { name: 'Deleted By', value: deletedBy, inline: true }
                    )
                    .setImage(attachment.proxyURL)
                    .setTimestamp();
                actionLog.postLog(message.guild, 'log_image_delete', embed, { channel: message.channel, member: message.member });
            }
        });
    }
}

async function handleMessageUpdate(oldMessage, newMessage) {
    if (newMessage.partial || !newMessage.guild || !newMessage.author || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setTitle('Message Edited')
        .addFields(
            { name: 'Author', value: newMessage.author.tag, inline: true },
            { name: 'Channel', value: newMessage.channel.toString(), inline: true },
            { name: 'Original Content', value: `\`\`\`${(oldMessage.content || '*Empty*').substring(0, 1000)}\`\`\`` },
            { name: 'Updated Content', value: `\`\`\`${(newMessage.content || '*Empty*').substring(0, 1000)}\`\`\`` }
        )
        .setURL(newMessage.url)
        .setTimestamp();
    actionLog.postLog(newMessage.guild, 'log_message_edit', embed, { channel: newMessage.channel, member: newMessage.member });
}

async function handleRoleCreate(role) {
    try {
        const executor = await getExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Role Created')
            .setDescription(`Role **${role.name}** was created ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();
        actionLog.postLog(role.guild, 'log_role_create', embed);
    } catch (error) {
        logger.error('Failed to process roleCreate event:', error);
    }
}

async function handleRoleDelete(role) {
    try {
        const executor = await getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Role Deleted')
            .setDescription(`Role **${role.name}** was deleted ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();
        actionLog.postLog(role.guild, 'log_role_delete', embed);
    } catch (error) {
        logger.error('Failed to process roleDelete event:', error);
    }
}

async function handleRoleUpdate(oldRole, newRole) {
    const executor = await getExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const changes = [];

    if (oldRole.name !== newRole.name) {
        changes.push(`**Name:** \`${oldRole.name}\` -> \`${newRole.name}\``);
    }
    if (oldRole.color !== newRole.color) {
        changes.push(`**Color:** \`#${oldRole.hexColor}\` -> \`#${newRole.hexColor}\``);
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push('**Permissions changed.**');
    }
    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Updated')
        .setDescription(`Role **${newRole.name}** was updated ${executor ? `by **${executor.tag}**` : ''}.\n\n${changes.join('\n')}`)
        .setTimestamp();
    actionLog.postLog(newRole.guild, 'log_role_update', embed);
}

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (member.user.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (oldChannel?.id === newChannel?.id) return;

    if (!oldChannel && newChannel) {
        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Voice Channel Joined')
            .setDescription(`${member.user} joined voice channel ${newChannel}.`)
            .setTimestamp();
        actionLog.postLog(member.guild, 'log_voice_join', embed, { channel: newChannel, member });
    }
    else if (oldChannel && !newChannel) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Voice Channel Left')
            .setDescription(`${member.user} left voice channel ${oldChannel}.`)
            .setTimestamp();
        actionLog.postLog(member.guild, 'log_voice_leave', embed, { channel: oldChannel, member });
    }
    else if (oldChannel && newChannel) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Voice Channel Moved')
            .setDescription(`${member.user} moved from ${oldChannel} to ${newChannel}.`)
            .setTimestamp();
        actionLog.postLog(member.guild, 'log_voice_move', embed, { channel: newChannel, member });
    }
}

/**
 * Registers all the necessary event listeners for the action log system.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function registerActionLogEvents(client) {
    client.on(Events.ChannelCreate, handleChannelCreate);
    client.on(Events.ChannelDelete, handleChannelDelete);
    client.on(Events.ChannelUpdate, handleChannelUpdate);
    client.on(Events.GuildBanAdd, handleGuildBanAdd);
    client.on(Events.GuildBanRemove, handleGuildBanRemove);
    client.on(Events.GuildMemberAdd, handleMemberAdd);
    client.on(Events.GuildMemberRemove, handleMemberRemove);
    client.on(Events.GuildMemberUpdate, handleMemberUpdate);
    client.on(Events.InviteCreate, handleInviteCreate);
    client.on(Events.InviteDelete, handleInviteDelete);
    client.on(Events.MessageDelete, handleMessageDelete);
    client.on(Events.MessageUpdate, handleMessageUpdate);
    client.on(Events.RoleCreate, handleRoleCreate);
    client.on(Events.RoleDelete, handleRoleDelete);
    client.on(Events.RoleUpdate, handleRoleUpdate);
    client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);
}

module.exports = { registerActionLogEvents };

