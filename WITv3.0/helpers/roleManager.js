const { MessageFlags } = require('discord.js');
const configManager = require('@helpers/configManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const logger = require('@helpers/logger');
const auditLogger = require('@helpers/auditLogger');
const { buildPromotionEmbed } = require('@embeds/promoteEmbed');
const charManager = require('@helpers/characterManager');

/**
 * Finds a role in a guild by its ID.
 * @param {import('discord.js').Guild} guild - The guild object.
 * @param {string} roleId - The ID of the role to find.
 * @returns {import('discord.js').Role | undefined}
 */
const findRoleById = (guild, roleId) => {
    return guild.roles.cache.get(roleId);
};

/**
 * Synchronizes a Discord member's roles to match the state stored in the database.
 * This function now includes a verification step.
 * @param {import('discord.js').GuildMember} member - The guild member to sync.
 * @returns {Promise<{
 * added: string[],
 * removed: string[],
 * discrepancies: { missing: string[], extra: string[] } | null
 * }>} An object containing the names of attempted role changes and any found discrepancies.
 */
async function syncRolesFromDb(member) {
    logger.info(`Syncing roles for ${member.user.tag} from database to Discord.`);
    const guild = member.guild;
    const intendedAdd = [];
    const intendedRemove = [];

    // 1. Get the desired state from the database
    const userData = await charManager.getChars(member.id);
    const targetRoleIds = new Set(userData && userData.main && userData.main.roles ? userData.main.roles : []);

    // 2. Get the current state from Discord
    const currentRoleIds = new Set(member.roles.cache.map(r => r.id));

    // 3. Calculate the difference
    const allManageableRoleIds = await roleHierarchyManager.getAllManageableRoleIds();
    const rolesToAddIds = [...targetRoleIds].filter(id => !currentRoleIds.has(id));
    const rolesToRemoveIds = [...currentRoleIds].filter(id => !targetRoleIds.has(id) && allManageableRoleIds.has(id));

    // 4. Apply the changes with better error tracking
    const roleChangeErrors = [];

    if (rolesToAddIds.length > 0) {
        const roles = rolesToAddIds.map(id => findRoleById(guild, id)).filter(Boolean);
        intendedAdd.push(...roles.map(r => r.name));
        try {
            await member.roles.add(roles, 'Role sync from database');
            logger.info(`Added roles to ${member.user.tag}: ${roles.map(r => r.name).join(', ')}`);
        } catch (err) {
            logger.error(`Failed to add roles to ${member.user.tag}:`, err);
            roleChangeErrors.push(`Failed to add: ${roles.map(r => r.name).join(', ')}`);
        }
    }

    if (rolesToRemoveIds.length > 0) {
        const roles = rolesToRemoveIds.map(id => findRoleById(guild, id)).filter(Boolean);
        intendedRemove.push(...roles.map(r => r.name));
        try {
            await member.roles.remove(roles, 'Role sync from database');
            logger.info(`Removed roles from ${member.user.tag}: ${roles.map(r => r.name).join(', ')}`);
        } catch (err) {
            logger.error(`Failed to remove roles from ${member.user.tag}:`, err);
            roleChangeErrors.push(`Failed to remove: ${roles.map(r => r.name).join(', ')}`);
        }
    }

    // 5. Wait for Discord API to propagate changes (important!)
    if (intendedAdd.length > 0 || intendedRemove.length > 0) {
        logger.info(`Waiting for Discord API to propagate role changes for ${member.user.tag}...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay
    }

    // 6. Verification with retry logic
    let discrepancies = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            // Re-fetch the member to get the most up-to-date roles from the API
            const freshMember = await guild.members.fetch({ user: member.id, force: true });
            const finalRoleIds = new Set(freshMember.roles.cache.map(r => r.id));

            // Compare final state with target state
            const missingRoleIds = [...targetRoleIds].filter(id => !finalRoleIds.has(id));
            const extraRoleIds = [...finalRoleIds].filter(id => !targetRoleIds.has(id) && allManageableRoleIds.has(id));

            if (missingRoleIds.length === 0 && extraRoleIds.length === 0) {
                // Success! No discrepancies found
                break;
            }

            // Still have discrepancies
            discrepancies = {
                missing: missingRoleIds.map(id => findRoleById(guild, id)?.name || `Unknown Role ID: ${id}`),
                extra: extraRoleIds.map(id => findRoleById(guild, id)?.name || `Unknown Role ID: ${id}`)
            };

            retryCount++;
            if (retryCount < maxRetries) {
                logger.info(`Discrepancies found for ${member.user.tag}, retrying in ${retryCount * 1000}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryCount * 1000)); // Exponential backoff
            }
        } catch (error) {
            logger.error(`Error during verification for ${member.user.tag}:`, error);
            retryCount++;
            if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            }
        }
    }

    if (discrepancies) {
        logger.warn(`Persistent role discrepancy found for ${member.user.tag} after ${maxRetries} retries:`, discrepancies);
    }

    // Include any role change errors in the response
    if (roleChangeErrors.length > 0) {
        if (!discrepancies) discrepancies = { missing: [], extra: [] };
        discrepancies.errors = roleChangeErrors;
    }

    return { added: intendedAdd, removed: intendedRemove, discrepancies };
}


/**
 * Manages role changes for a user based on the defined hierarchy.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {'promote' | 'demote'} action - The action to perform.
 */
async function manageRoles(interaction, action) {
    const targetUser = interaction.options.getUser('user');
    const targetRankName = interaction.options.getString('rank');
    let dmSendFailed = false;

    const isLeadershipAction = targetRankName.toLowerCase() === 'leadership';
    const isRemoveAllAction = action === 'demote' && targetRankName === 'Remove All Roles';

    if (isLeadershipAction || isRemoveAllAction) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You must be an Admin to manage the Leadership rank or remove all roles.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    } else {
        if (!isCouncilOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You must have the Council role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    await interaction.deferReply({});

    const member = await interaction.guild.members.fetch(targetUser.id);
    const hierarchy = await roleHierarchyManager.get();
    const config = configManager.get();

    if (action === 'promote') {
        const promotionDMs = config.promotionDMs || {};
        const dmData = promotionDMs[targetRankName];

        if (dmData && dmData.channelId && dmData.message) {
            const promotionEmbed = buildPromotionEmbed(targetRankName, dmData);
            try {
                await targetUser.send({ embeds: [promotionEmbed] });
            } catch (dmError) {
                logger.warn(`Could not send promotion DM to ${targetUser.tag}. They may have DMs disabled.`);
                dmSendFailed = true;
            }
        }
    }

    try {
        const userData = await charManager.getChars(member.id);
        if (!userData || !userData.main) {
            return interaction.editReply({ content: `Error: ${targetUser.tag} is not registered with a main character. Cannot manage roles.` });
        }
        let newRoleIds = new Set(userData.main.roles || []);

        if (action === 'demote' && targetRankName === 'Remove All Roles') {
            const allManageableRoleIds = await roleHierarchyManager.getAllManageableRoleIds();
            newRoleIds = new Set([...newRoleIds].filter(id => !allManageableRoleIds.has(id)));
        } else {
            const rankConfig = hierarchy[targetRankName];
            if (!rankConfig) {
                return interaction.editReply({ content: `The rank "${targetRankName}" is not defined in the role hierarchy.` });
            }

            const actionConfig = rankConfig[action];
            if (!actionConfig) {
                return interaction.editReply({ content: `No configuration found for the "${action}" action on the "${targetRankName}" rank.` });
            }

            if (actionConfig.add) actionConfig.add.forEach(id => newRoleIds.add(id));
            if (actionConfig.remove) actionConfig.remove.forEach(id => newRoleIds.delete(id));
        }

        await charManager.updateUserRoles(member.id, Array.from(newRoleIds));
        logger.info(`Updated database roles for ${member.user.tag}.`);

        const { added, removed, discrepancies } = await syncRolesFromDb(member);

        let replyMessage = `Role changes for ${targetUser.tag} completed.\n`;
        if (added.length > 0) replyMessage += `> **Added:** ${added.join(', ')}\n`;
        if (removed.length > 0) replyMessage += `> **Removed:** ${removed.join(', ')}\n`;
        if (added.length === 0 && removed.length === 0) {
            replyMessage = `No role changes were necessary for ${targetUser.tag}. Their roles are already in the correct state.`;
        }
        if (dmSendFailed) {
            replyMessage += `\n*(Note: Could not send a confirmation DM to the user.)*`;
        }

        if (discrepancies) {
            replyMessage += `\n\n**⚠️ Warning: Role discrepancies found after sync!**`;
            if (discrepancies.missing.length > 0) {
                replyMessage += `\n- **Roles missing on Discord:** ${discrepancies.missing.join(', ')}`;
            }
            if (discrepancies.extra.length > 0) {
                replyMessage += `\n- **Extra roles found on Discord:** ${discrepancies.extra.join(', ')}`;
            }
            replyMessage += `\nThis can happen due to Discord API issues. You can run \`/refreshroles user:@${targetUser.tag}\` to try again.`;
        }

        if (added.length > 0 || removed.length > 0) {
            await auditLogger.logRoleChange(interaction, targetUser, action, added, removed);
        }

        await interaction.editReply({ content: replyMessage });

    } catch (error) {
        logger.error('Error managing roles:', error);
        await interaction.editReply({ content: 'An error occurred while trying to manage roles.' });
    }
}

const hasRole = (member, roleListName) => {
    const config = configManager.get();
    if (!config || !config[roleListName]) {
        logger.warn(`Permission check failed: "${roleListName}" not found in config.`);
        return false;
    }
    const requiredRoleIds = config[roleListName];
    return member.roles.cache.some(role => requiredRoleIds.includes(role.id));
};

const isAdmin = (member) => hasRole(member, 'adminRoles');
const isCouncil = (member) => hasRole(member, 'councilRoles');
const isCommander = (member) => hasRole(member, 'commanderRoles');
const canAuth = (member) => hasRole(member, 'authRoles');

const isCommanderOrAdmin = (member) => isCommander(member) || isAdmin(member);
const isCouncilOrAdmin = (member) => isCouncil(member) || isAdmin(member);

module.exports = {
    manageRoles,
    syncRolesFromDb,
    isAdmin,
    isCouncil,
    isCommander,
    canAuth,
    isCommanderOrAdmin,
    isCouncilOrAdmin,
};

