const { MessageFlags } = require('discord.js');
const configManager = require('@helpers/configManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const logger = require('@helpers/logger');
const auditLogger = require('@helpers/auditLogger');
const { buildPromotionEmbed } = require('@embeds/promoteEmbed');
const charManager = require('@helpers/characterManager');

/**
 * Checks if a member has at least one of the required permissions.
 * This is a direct check and does not use hierarchy.
 * @param {import('discord.js').GuildMember} member The member to check.
 * @param {string[]} requiredPermissions An array of permission strings (e.g., ['admin', 'leadership']).
 * @returns {boolean} True if the member has at least one of the permissions, false otherwise.
 */
function hasPermission(member, requiredPermissions) {
    if (!member || !requiredPermissions || !Array.isArray(requiredPermissions)) {
        return false;
    }

    // A map of permission names to their checking functions.
    const permissionChecks = {
        admin: isAdmin,
        founder: isFounder,
        leadership: isLeadership,
        officer: isOfficer,
        council: isCouncil,
        certified_trainer: isCertifiedTrainer,
        training_ct: isTrainingCt,
        fleet_commander: isFleetCommander,
        training_fc: isTrainingFc,
        assault_line_commander: isAssaultLineCommander,
        line_commander: isLineCommander,
        resident: isResident,
        commander: isCommander,
        auth: canAuth,
        public: () => true,
    };

    // Check if the user has any of the required permissions.
    return requiredPermissions.some(permission => {
        const check = permissionChecks[permission];
        return check ? check(member) : false;
    });
}

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
 * Gets the highest hierarchy level a member has based on their roles.
 * @param {import('discord.js').GuildMember} member - The guild member.
 * @returns {Promise<{level: number, rankName: string}>} The member's highest hierarchy level and rank name.
 */
async function getMemberHierarchyInfo(member) {
    const hierarchy = await roleHierarchyManager.get();
    const config = configManager.get();
    if (!hierarchy || !config) return { level: 0, rankName: 'Unranked' };

    // Handle Admin separately as it's user ID based.
    if (isAdmin(member)) {
        return { level: 1000, rankName: 'admin' };
    }

    let maxLevel = 0;
    let highestRankName = 'Unranked';

    const roleIdToRank = new Map();

    // Special roles that aren't in role_hierarchy table but have a level
    const specialRoles = {
        founderRoles: { name: 'founder', level: 999 },
        leadershipRoles: { name: 'leadership', level: 950 },
        officerRoles: { name: 'officer', level: 900 },
        councilRoles: { name: 'council', level: 850 }
    };

    for (const [configKey, rankInfo] of Object.entries(specialRoles)) {
        if (config[configKey]) {
            config[configKey].forEach(id => roleIdToRank.set(id, rankInfo));
        }
    }

    // Map all configured role IDs from the hierarchy table
    for (const rankName in hierarchy) {
        // Construct the key name, e.g., 'fleet_commander' -> 'fleetcommanderRoles', 'ct' -> 'ctRoles'
        const configKey = `${rankName.replace(/_/g, '')}Roles`;
        // Find the key case-insensitively from the loaded config
        const foundKey = Object.keys(config).find(k => k.toLowerCase() === configKey.toLowerCase());

        if (foundKey && Array.isArray(config[foundKey])) {
            config[foundKey].forEach(roleId => {
                // Don't overwrite higher-level special roles we just set
                if (!roleIdToRank.has(roleId)) {
                    roleIdToRank.set(roleId, { name: rankName, level: hierarchy[rankName].level });
                }
            });
        }
    }

    // Iterate over the member's roles to find their highest level
    member.roles.cache.forEach(role => {
        if (roleIdToRank.has(role.id)) {
            const rankInfo = roleIdToRank.get(role.id);
            if (rankInfo.level > maxLevel) {
                maxLevel = rankInfo.level;
                highestRankName = rankInfo.name;
            }
        }
    });

    return { level: maxLevel, rankName: highestRankName };
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

    // This is the specific check for this action.
    // The general permission is already checked before this command runs.
    if (isLeadershipAction || isRemoveAllAction) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You must be an Admin to manage the Leadership rank or remove all roles.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    await interaction.deferReply({});

    const member = await interaction.guild.members.fetch(targetUser.id);
    const executor = interaction.member;

    // --- HIERARCHY CHECKS ---
    const executorInfo = await getMemberHierarchyInfo(executor);
    const targetInfo = await getMemberHierarchyInfo(member);
    const hierarchy = await roleHierarchyManager.get();
    const targetRankLevel = hierarchy[targetRankName]?.level ?? 0;

    // Rule 0: Cannot manage your own roles
    if (executor.id === member.id) {
        return interaction.editReply({ content: 'You cannot manage your own roles.', flags: [MessageFlags.Ephemeral] });
    }

    // Rule 1: Executor must have a higher rank than the target. Admins are exempt.
    if (executorInfo.level <= targetInfo.level && !isAdmin(executor)) {
        return interaction.editReply({
            content: `You cannot manage roles for **${targetUser.tag}**. Your rank level (${executorInfo.level}) is not higher than theirs (${targetInfo.level}).`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Rule 2 for Promotion: Executor's rank must be >= rank they are promoting to. Admins are exempt.
    if (action === 'promote' && executorInfo.level < targetRankLevel && !isAdmin(executor)) {
        return interaction.editReply({
            content: `You cannot promote someone to **${targetRankName}**. Your rank level (${executorInfo.level}) is lower than the target rank's level (${targetRankLevel}).`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Rule 3 for Demotion: Executor cannot demote from a rank higher than their own. This is covered by Rule 1.

    // Rule 4: Special check for 'Remove All' - only Admins
    if (isRemoveAllAction && !isAdmin(executor)) {
        return interaction.editReply({ content: 'Only Admins can use the "Remove All Roles" option.', flags: [MessageFlags.Ephemeral] });
    }
    // --- END HIERARCHY CHECKS ---

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
        // Special handling for Remove All Roles
        if (isRemoveAllAction) {
            const removeAllRolesKey = Object.keys(config).find(k => k.toLowerCase() === 'removeallroles');
            const additionalRolesToRemove = removeAllRolesKey ? config[removeAllRolesKey] : [];
            const manageableRoles = await roleHierarchyManager.getAllManageableRoleIds();
            const rolesToRemoveIds = new Set([...manageableRoles, ...additionalRolesToRemove]);
            logger.info("Combined manageable roles and 'removeAllRoles' list for deletion.");

            const rolesToRemove = member.roles.cache.filter(role => rolesToRemoveIds.has(role.id));

            if (rolesToRemove.size === 0) {
                return interaction.editReply({ content: `${targetUser.tag} has no roles from the target list to remove.` });
            }

            const userData = await charManager.getChars(member.id);
            if (userData && userData.main) {
                const currentDbRoles = new Set(userData.main.roles || []);
                const newDbRoles = Array.from(currentDbRoles).filter(id => !rolesToRemoveIds.has(id));
                await charManager.updateUserRoles(member.id, newDbRoles);
                logger.info(`Updated database roles for ${member.user.tag} after 'Remove All'.`);
            }

            const removedRoleNames = rolesToRemove.map(r => r.name);
            await member.roles.remove(rolesToRemove, `Demote command by ${interaction.user.tag}: Remove All Roles`);

            await auditLogger.logRoleChange(interaction, targetUser, 'demote', [], removedRoleNames);
            await interaction.editReply({ content: `Removed roles from ${targetUser.tag}:\n> **Removed:** ${removedRoleNames.join(', ')}` });
            return;
        }

        // Standard promotion/demotion logic continues here...
        const userData = await charManager.getChars(member.id);
        if (!userData || !userData.main) {
            return interaction.editReply({ content: `Error: ${targetUser.tag} is not registered with a main character. Cannot manage roles.` });
        }
        let newRoleIds = new Set(userData.main.roles || []);

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
        // This is not an error, just means the role isn't configured.
        // logger.warn(`Permission check failed: "${roleListName}" not found in config.`);
        return false;
    }
    const requiredRoleIds = config[roleListName];
    if (!member || !member.roles) return false;
    return member.roles.cache.some(role => requiredRoleIds.includes(role.id));
};

const isAdmin = (member) => {
    if (!member) return false;
    // Server owner is always an admin
    if (member.id === member.guild.ownerId) return true;
    const config = configManager.get();
    const adminUsers = config && config.adminUsers ? config.adminUsers : [];
    return adminUsers.includes(member.id);
};

const isFounder = (member) => hasRole(member, 'founderRoles');
const isLeadership = (member) => hasRole(member, 'leadershipRoles');
const isOfficer = (member) => hasRole(member, 'officerRoles');
const isCouncil = (member) => hasRole(member, 'councilRoles');
const isCertifiedTrainer = (member) => hasRole(member, 'certifiedtrainerRoles');
const isTrainingCt = (member) => hasRole(member, 'trainingCtRoles');
const isFleetCommander = (member) => hasRole(member, 'fleetcommanderRoles');
const isTrainingFc = (member) => hasRole(member, 'trainingFcRoles');
const isAssaultLineCommander = (member) => hasRole(member, 'assaultLineCommanderRoles');
const isLineCommander = (member) => hasRole(member, 'lineCommanderRoles');
const isResident = (member) => hasRole(member, 'residentRoles');
const isCommander = (member) => hasRole(member, 'commanderRoles');
const canAuth = (member) => hasRole(member, 'authRoles');

module.exports = {
    hasPermission,
    manageRoles,
    syncRolesFromDb,
    getMemberHierarchyInfo,
    isAdmin,
    isFounder,
    isLeadership,
    isOfficer,
    isCouncil,
    isCertifiedTrainer,
    isTrainingCt,
    isFleetCommander,
    isTrainingFc,
    isAssaultLineCommander,
    isLineCommander,
    isResident,
    isCommander,
    canAuth,
};

