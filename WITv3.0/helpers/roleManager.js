const { MessageFlags } = require('discord.js');
const configManager = require('@helpers/configManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const logger = require('@helpers/logger');
const auditLogger = require('@helpers/auditLogger');
const { buildPromotionEmbed } = require('@embeds/promoteEmbed');

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
 * Manages role changes for a user based on the defined hierarchy.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {'promote' | 'demote'} action - The action to perform.
 */
async function manageRoles(interaction, action) {
    const targetUser = interaction.options.getUser('user');
    const targetRankName = interaction.options.getString('rank');
    let dmSendFailed = false; // Flag to track DM status

    // New permission check logic
    const isLeadershipAction = targetRankName.toLowerCase() === 'leadership';
    // The "Remove All Roles" option is specific to the demote command.
    const isRemoveAllAction = action === 'demote' && targetRankName === 'Remove All Roles';

    if (isLeadershipAction || isRemoveAllAction) {
        // Admin is required for leadership changes or removing all roles
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You must be an Admin to manage the Leadership rank or remove all roles.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    } else {
        // Council is sufficient for all other promotions/demotions
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

    // --- Send DM on Promotion ---
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

    // Handle the special "Remove All" case for demotion
    if (action === 'demote' && targetRankName === 'Remove All Roles') {
        const removedRoles = [];
        const allManageableRoleIds = new Set();
        Object.values(hierarchy).forEach(rank => {
            rank.promote?.add?.forEach(id => allManageableRoleIds.add(id));
            rank.demote?.add?.forEach(id => allManageableRoleIds.add(id));
        });

        for (const roleId of allManageableRoleIds) {
            const role = findRoleById(interaction.guild, roleId);
            if (role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                removedRoles.push(role.name);
            }
        }
        const reply = removedRoles.length > 0
            ? `Removed the following roles from ${targetUser.tag}: ${removedRoles.join(', ')}.`
            : `${targetUser.tag} did not have any of the manageable roles to remove.`;
        return interaction.editReply({ content: reply });
    }

    const rankConfig = hierarchy[targetRankName];
    if (!rankConfig) {
        return interaction.editReply({ content: `The rank "${targetRankName}" is not defined in the role hierarchy.` });
    }

    const actionConfig = rankConfig[action];
    if (!actionConfig) {
        return interaction.editReply({ content: `No configuration found for the "${action}" action on the "${targetRankName}" rank.` });
    }

    const addedRoles = [];
    const removedRoles = [];

    try {
        // Process roles to add
        if (actionConfig.add) {
            for (const roleId of actionConfig.add) {
                const role = findRoleById(interaction.guild, roleId);
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                }
            }
        }

        // Process roles to remove
        if (actionConfig.remove) {
            for (const roleId of actionConfig.remove) {
                const role = findRoleById(interaction.guild, roleId);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                }
            }
        }

        let replyMessage = `Role changes for ${targetUser.tag} completed.\n`;
        if (addedRoles.length > 0) replyMessage += `> **Added:** ${addedRoles.join(', ')}\n`;
        if (removedRoles.length > 0) replyMessage += `> **Removed:** ${removedRoles.join(', ')}\n`;
        if (addedRoles.length === 0 && removedRoles.length === 0) {
            replyMessage = `No role changes were necessary for ${targetUser.tag}.`;
        }

        // Add the DM failure note to the reply if needed.
        if (dmSendFailed) {
            replyMessage += `\n*(Note: Could not send a confirmation DM to the user.)*`;
        }

        // Log the audit event if any roles were changed.
        if (addedRoles.length > 0 || removedRoles.length > 0) {
            await auditLogger.logRoleChange(interaction, targetUser, action, addedRoles, removedRoles);
        }

        await interaction.editReply({ content: replyMessage });

    } catch (error) {
        logger.error('Error managing roles:', error);
        await interaction.editReply({ content: 'An error occurred while trying to manage roles.' });
    }
}

// ================================================================= //
// =================== CENTRALIZED PERMISSION CHECKS ================= //
// ================================================================= //

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

// Composite permission checks
const isCommanderOrAdmin = (member) => isCommander(member) || isAdmin(member);
const isCouncilOrAdmin = (member) => isCouncil(member) || isAdmin(member);


module.exports = {
    manageRoles,
    isAdmin,
    isCouncil,
    isCommander,
    canAuth,
    isCommanderOrAdmin,
    isCouncilOrAdmin,
};

