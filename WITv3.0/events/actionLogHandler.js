const { Events, EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const actionLog = require('@helpers/actionLog');
const logger = require('@helpers/logger');
const characterManager = require('@helpers/characterManager');
const ErrorHandler = require('@helpers/errorHandler');

// --- Utility Functions ---

/**
 * Checks if the bot has permission to view audit logs
 * @param {import('discord.js').Guild} guild 
 * @returns {boolean}
 */
function canAccessAuditLogs(guild) {
    const botMember = guild.members.cache.get(guild.client.user.id);
    if (!botMember) return false;

    return botMember.permissions.has('ViewAuditLog');
}

// Global flag to avoid spamming permission warnings
let auditLogPermissionWarned = false;

/**
 * Fetches the audit log entry for a specific action and target with enhanced retry logic.
 * @param {import('discord.js').Guild} guild - The guild to fetch logs from.
 * @param {import('discord.js').AuditLogEvent} eventType - The type of audit log to fetch.
 * @param {string} targetId - The ID of the object that was actioned upon.
 * @param {Function|null} [changeFilter=null] - An optional function to further filter the log entry based on its `changes` array.
 * @returns {Promise<import('discord.js').GuildAuditLogsEntry|null>} The full audit log entry, or null.
 */
async function getAuditLogEntry(guild, eventType, targetId, changeFilter = null) {
    // Check permissions before attempting
    if (!canAccessAuditLogs(guild)) {
        if (!auditLogPermissionWarned) {
            logger.warn('Bot lacks "View Audit Log" permission. Cannot fetch audit logs.');
            auditLogPermissionWarned = true;
        }
        return null;
    }

    const context = `fetching audit logs for ${eventType} on ${targetId}`;

    return await ErrorHandler.retry(async () => {
        try {
            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 20, // Increased for better coverage
                type: eventType,
            });

            // Look for matching log entry
            const log = fetchedLogs.entries.find(entry => {
                // Check if target matches
                const targetMatches = entry.target?.id === targetId;

                // Check if it's recent (within last 10 seconds)
                const isRecent = entry.createdTimestamp > (Date.now() - 10000);

                // Check optional change filter
                const passesFilter = !changeFilter || (entry.changes && changeFilter(entry.changes));

                return targetMatches && isRecent && passesFilter;
            });

            if (!log) {
                // Create custom error to trigger retry
                const error = new Error(`Audit log entry not found`);
                error.code = 'AUDIT_LOG_NOT_FOUND';
                throw error;
            }

            // Use logger.info instead of logger.debug for compatibility
            logger.info(`Found audit log entry for ${eventType} on ${targetId}`);
            return log;

        } catch (error) {
            if (error.code === 'AUDIT_LOG_NOT_FOUND') {
                throw error; // Let retry handler deal with it
            }

            // Log other errors and let ErrorHandler manage them
            logger.warn(`Error fetching audit logs: ${error.message}`);
            throw error;
        }
    }, 3, 500, context, { allowNull: true, retryOnPermissionError: false });
}

// --- Enhanced Event Handlers ---

async function handleChannelCreate(channel) {
    if (!channel.guild) return;

    try {
        const logEntry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Channel Created')
            .setDescription(`Channel **#${channel.name}** was created ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();

        actionLog.postLog(channel.guild, 'log_channel_create', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling channel create event for #${channel.name}`);
    }
}

async function handleChannelDelete(channel) {
    if (!channel.guild) return;

    try {
        const logEntry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Channel Deleted')
            .setDescription(`Channel **#${channel.name}** was deleted ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();

        actionLog.postLog(channel.guild, 'log_channel_delete', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling channel delete event for #${channel.name}`);
    }
}

async function handleChannelUpdate(oldChannel, newChannel) {
    if (!newChannel.guild) return;

    try {
        const changes = [];
        let permissionChanges = '';

        if (oldChannel.name !== newChannel.name) {
            changes.push(`**Name:** \`${oldChannel.name}\` -> \`${newChannel.name}\``);
        }
        if (oldChannel.topic !== newChannel.topic) {
            changes.push(`**Topic:** \`${oldChannel.topic || 'None'}\` -> \`${newChannel.topic || 'None'}\``);
        }

        // Permission change detection (simplified for space)
        const oldPerms = oldChannel.permissionOverwrites.cache;
        const newPerms = newChannel.permissionOverwrites.cache;

        if (oldPerms.size !== newPerms.size) {
            permissionChanges = 'Permission overwrites were modified';
        }

        if (changes.length === 0 && permissionChanges.length === 0) return;

        const logEntry = await getAuditLogEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Channel Updated')
            .setDescription(`Channel ${newChannel} was updated ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();

        if (changes.length > 0) {
            embed.addFields({ name: 'Changes', value: changes.join('\n') });
        }
        if (permissionChanges.length > 0) {
            embed.addFields({ name: 'Permissions', value: permissionChanges });
        }

        actionLog.postLog(newChannel.guild, 'log_channel_update', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling channel update event for #${newChannel.name}`);
    }
}

async function handleGuildBanAdd(ban) {
    try {
        const logEntry = await getAuditLogEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Member Banned')
            .setDescription(`${ban.user.tag} was banned ${executor ? `by **${executor.tag}**` : ''}.\n**Reason:** ${ban.reason || 'No reason provided.'}`)
            .setThumbnail(ban.user.displayAvatarURL())
            .setTimestamp();

        actionLog.postLog(ban.guild, 'log_member_ban', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling ban event for ${ban.user.tag}`);
    }
}

async function handleGuildBanRemove(ban) {
    try {
        const logEntry = await getAuditLogEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Member Unbanned')
            .setDescription(`${ban.user.tag} was unbanned ${executor ? `by **${executor.tag}**` : ''}.`)
            .setThumbnail(ban.user.displayAvatarURL())
            .setTimestamp();

        actionLog.postLog(ban.guild, 'log_member_unban', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling unban event for ${ban.user.tag}`);
    }
}

async function handleInviteCreate(invite) {
    if (!invite.guild) return;

    try {
        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Invite Created')
            .setDescription(`Invite \`${invite.code}\` created by **${invite.inviter.tag}** for channel ${invite.channel}.`)
            .addFields(
                { name: 'Max Uses', value: `${invite.maxUses || 'Infinite'}`, inline: true },
                { name: 'Expires', value: invite.expiresTimestamp ? `` : 'Never', inline: true }
            )
            .setTimestamp();

        actionLog.postLog(invite.guild, 'log_invite_create', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling invite create event`);
    }
}

async function handleInviteDelete(invite) {
    if (!invite.guild) return;

    try {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Invite Deleted')
            .setDescription(`Invite \`${invite.code}\` for channel ${invite.channel} was deleted.`)
            .setTimestamp();

        actionLog.postLog(invite.guild, 'log_invite_delete', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling invite delete event`);
    }
}

async function handleMemberAdd(member) {
    try {
        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Member Joined')
            .setDescription(`${member.user.tag} (${member.id}) has joined the server.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        actionLog.postLog(member.guild, 'log_member_join', embed, { member });
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling member join event for ${member.user.tag}`);
    }
}

async function handleMemberRemove(member) {
    try {
        const logEntry = await getAuditLogEntry(member.guild, AuditLogEvent.MemberKick, member.id);
        const executor = logEntry ? logEntry.executor : null;
        const action = executor ? 'kicked' : 'left';

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`Member ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`${member.user.tag} has ${action} the server ${executor ? `(Kicked by ${executor.tag})` : ''}.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        // Database cleanup with error handling
        try {
            const userInDb = await characterManager.getChars(member.id);
            if (userInDb) {
                const success = await characterManager.clearUserRoles(member.id);
                if (success) {
                    logger.info(`Cleared database roles for ${member.user.tag} (${member.id}) who left the server.`);
                    embed.addFields({ name: 'Database Roles', value: 'Cleared successfully.' });
                } else {
                    logger.warn(`Failed to clear database roles for ${member.user.tag} (${member.id}).`);
                    embed.addFields({ name: 'Database Roles', value: 'Failed to clear.' });
                }
            }
        } catch (error) {
            logger.error(`Error clearing roles for leaving member ${member.id}:`, error);
            embed.addFields({ name: 'Database Roles', value: 'Error during cleanup.' });
        }

        actionLog.postLog(member.guild, 'log_member_leave', embed, { member });
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling member leave event for ${member.user.tag}`);
    }
}

/**
 * Handles timeout changes for a member
 */
async function handleTimeoutChanges(oldMember, newMember) {
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if ((oldTimeout || null) !== (newTimeout || null)) {
        try {
            const logEntry = await getAuditLogEntry(
                newMember.guild,
                AuditLogEvent.MemberUpdate,
                newMember.id,
                (changes) => changes.some(c => c.key === 'communication_disabled_until')
            );
            const executor = logEntry ? logEntry.executor : null;

            if (newTimeout && newTimeout > Date.now()) {
                const embed = new EmbedBuilder()
                    .setColor(0x43B581)
                    .setTitle('Member Timeout Removed')
                    .setDescription(`The timeout for ${newMember.user.tag} was removed ${executor ? `by **${executor.tag}**` : ''}.`)
                    .setTimestamp();
                actionLog.postLog(newMember.guild, 'log_member_timeout', embed, { member: newMember });
            }
        } catch (error) {
            await ErrorHandler.handleDiscordError(error, `handling timeout changes for ${newMember.user.tag}`);
        }
    }
}

/**
 * Handles nickname changes for a member
 */
async function handleNicknameChanges(oldMember, newMember) {
    if (oldMember.nickname !== newMember.nickname) {
        try {
            const logEntry = await getAuditLogEntry(
                newMember.guild,
                AuditLogEvent.MemberUpdate,
                newMember.id,
                (changes) => changes.some(c => c.key === 'nick')
            );
            const executor = logEntry ? logEntry.executor : null;

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
        } catch (error) {
            await ErrorHandler.handleDiscordError(error, `handling nickname changes for ${newMember.user.tag}`);
        }
    }
}

/**
 * Handles role changes for a member
 */
async function handleRoleChanges(oldMember, newMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (oldRoles.size !== newRoles.size || !oldRoles.every((value, key) => newRoles.has(key))) {
        try {
            // Automatically update the user's roles in the database to keep it in sync
            try {
                const userInDb = await characterManager.getChars(newMember.id);
                if (userInDb) {
                    const newRoleIds = newRoles.map(role => role.id);
                    await characterManager.updateUserRoles(newMember.id, newRoleIds);
                    logger.info(`Automatically updated database roles for ${newMember.user.tag} due to a role change event.`);
                }
            } catch (dbError) {
                logger.error(`Error auto-updating roles in DB for ${newMember.id}:`, dbError);
            }

            let addedRoles = [];
            let removedRoles = [];
            let executor = null;

            const logEntry = await getAuditLogEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

            if (logEntry) {
                executor = logEntry.executor;
                const roleChanges = logEntry.changes;
                const added = roleChanges.find(c => c.key === '$add');
                const removed = roleChanges.find(c => c.key === '$remove');
                if (added) addedRoles = added.new.map(r => `<@&${r.id}>`);
                if (removed) removedRoles = removed.new.map(r => `<@&${r.id}>`);
            } else {
                addedRoles = newRoles.filter(role => !oldRoles.has(role.id)).map(r => r.toString());
                removedRoles = oldRoles.filter(role => !newRoles.has(role.id)).map(r => r.toString());
            }

            if (addedRoles.length > 0 || removedRoles.length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('Member Roles Updated')
                    .setDescription(`Roles for **${newMember.user.tag}** were updated ${executor ? `by **${executor.tag}**` : ''}.`)
                    .setTimestamp();

                if (addedRoles.length > 0) {
                    embed.addFields({ name: 'Roles Added', value: addedRoles.join('\n'), inline: true });
                    embed.setColor(0x43B581);
                }
                if (removedRoles.length > 0) {
                    embed.addFields({ name: 'Roles Removed', value: removedRoles.join('\n'), inline: true });
                    embed.setColor(0xED4245);
                }
                if (addedRoles.length > 0 && removedRoles.length > 0) {
                    embed.setColor(0x4E5D94);
                }
                actionLog.postLog(newMember.guild, 'log_member_role_update', embed, { member: newMember });
            }
        } catch (error) {
            await ErrorHandler.handleDiscordError(error, `handling role changes for ${newMember.user.tag}`);
        }
    }
}

/**
 * Main member update handler - now clean and modular!
 */
async function handleMemberUpdate(oldMember, newMember) {
    if (newMember.user.bot) return;

    try {
        await handleTimeoutChanges(oldMember, newMember);
        await handleNicknameChanges(oldMember, newMember);
        await handleRoleChanges(oldMember, newMember);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling member update for ${newMember.user.tag}`);
    }
}

async function handleMessageDelete(message) {
    if (message.partial || !message.guild || !message.author || message.author.bot) return;

    try {
        const logEntry = await getAuditLogEntry(message.guild, AuditLogEvent.MessageDelete, message.author.id);
        const executor = logEntry ? logEntry.executor : null;

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
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling message delete event`);
    }
}

async function handleMessageUpdate(oldMessage, newMessage) {
    // Basic checks to prevent logging unnecessary events
    if (newMessage.partial || !newMessage.guild || !newMessage.author || newMessage.author.bot) return;
    // Ignore updates that don't change content (e.g., embed loading)
    if (oldMessage.content === newMessage.content) return;

    try {
        // Fetch the member object to ensure we have the most up-to-date server-specific info
        const member = newMessage.member || await newMessage.guild.members.fetch(newMessage.author.id);

        const embed = new EmbedBuilder()
            .setColor(0xFAA61A) // Orange color for edits
            .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
            .setDescription(`Message edited in ${newMessage.channel}. [Jump to Message](${newMessage.url})`)
            .addFields(
                // Shows the user's full tag and makes them clickable
                { name: 'User', value: `${newMessage.author} (${newMessage.author.tag})`, inline: false },
                // Shows the original content
                { name: 'Before', value: `\`\`\`${(oldMessage.content || '*Empty or an embed*').substring(0, 1020)}\`\`\`` },
                // Shows the new, updated content
                { name: 'After', value: `\`\`\`${(newMessage.content || '*Empty*').substring(0, 1020)}\`\`\`` }
            )
            .setTimestamp();

        actionLog.postLog(newMessage.guild, 'log_message_edit', embed, { channel: newMessage.channel, member: newMessage.member });
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling message edit event`);
    }
}


async function handleRoleCreate(role) {
    try {
        const logEntry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0x43B581)
            .setTitle('Role Created')
            .setDescription(`Role **${role.name}** was created ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();
        actionLog.postLog(role.guild, 'log_role_create', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling role create event for ${role.name}`);
    }
}

async function handleRoleDelete(role) {
    try {
        const logEntry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
        const executor = logEntry ? logEntry.executor : null;

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Role Deleted')
            .setDescription(`Role **${role.name}** was deleted ${executor ? `by **${executor.tag}**` : ''}.`)
            .setTimestamp();
        actionLog.postLog(role.guild, 'log_role_delete', embed);
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling role delete event for ${role.name}`);
    }
}

async function handleRoleUpdate(oldRole, newRole) {
    try {
        const logEntry = await getAuditLogEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        const executor = logEntry ? logEntry.executor : null;
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
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling role update event for ${newRole.name}`);
    }
}

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (member.user.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (oldChannel?.id === newChannel?.id) return;

    try {
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
    } catch (error) {
        await ErrorHandler.handleDiscordError(error, `handling voice state update for ${member.user.tag}`);
    }
}

/**
 * Registers all the necessary event listeners for the action log system.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function registerActionLogEvents(client) {
    // Wrap each handler with error boundaries
    client.on(Events.ChannelCreate, ErrorHandler.wrapAsync(handleChannelCreate, 'channel create event'));
    client.on(Events.ChannelDelete, ErrorHandler.wrapAsync(handleChannelDelete, 'channel delete event'));
    client.on(Events.ChannelUpdate, ErrorHandler.wrapAsync(handleChannelUpdate, 'channel update event'));
    client.on(Events.GuildBanAdd, ErrorHandler.wrapAsync(handleGuildBanAdd, 'member ban event'));
    client.on(Events.GuildBanRemove, ErrorHandler.wrapAsync(handleGuildBanRemove, 'member unban event'));
    client.on(Events.GuildMemberAdd, ErrorHandler.wrapAsync(handleMemberAdd, 'member join event'));
    client.on(Events.GuildMemberRemove, ErrorHandler.wrapAsync(handleMemberRemove, 'member leave event'));
    client.on(Events.GuildMemberUpdate, ErrorHandler.wrapAsync(handleMemberUpdate, 'member update event'));
    client.on(Events.InviteCreate, ErrorHandler.wrapAsync(handleInviteCreate, 'invite create event'));
    client.on(Events.InviteDelete, ErrorHandler.wrapAsync(handleInviteDelete, 'invite delete event'));
    client.on(Events.MessageDelete, ErrorHandler.wrapAsync(handleMessageDelete, 'message delete event'));
    client.on(Events.MessageUpdate, ErrorHandler.wrapAsync(handleMessageUpdate, 'message edit event'));
    client.on(Events.RoleCreate, ErrorHandler.wrapAsync(handleRoleCreate, 'role create event'));
    client.on(Events.RoleDelete, ErrorHandler.wrapAsync(handleRoleDelete, 'role delete event'));
    client.on(Events.RoleUpdate, ErrorHandler.wrapAsync(handleRoleUpdate, 'role update event'));
    client.on(Events.VoiceStateUpdate, ErrorHandler.wrapAsync(handleVoiceStateUpdate, 'voice state update event'));

    logger.info('Action log event handlers registered with enhanced error handling');
}

module.exports = { registerActionLogEvents };
