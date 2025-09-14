const configManager = require('./configManager');
const logger = require('./logger');

/**
 * Manages role changes for a user based on a defined hierarchy.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {'promote' | 'demote'} action - The action to perform ('promote' or 'demote').
 */
async function manageRoles(interaction, action) {
    // Get a fresh config every time the function is called
    const config = configManager.get();
    const targetUser = interaction.options.getUser('user');
    const targetRoleName = interaction.options.getString('role');
    let member = await interaction.guild.members.fetch(targetUser.id);

    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.' });
    }

    // Handle the special "Remove All" case
    if (action === 'demote' && targetRoleName === 'REMOVE_ALL') {
        // ... (rest of the function is unchanged)
        const removedRoles = [];
        const manageableRoleNames = Object.keys(config.roleHierarchy);

        try {
            for (const roleName of manageableRoleNames) {
                const role = findRole(interaction.guild, roleName);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                }
            }
            if (removedRoles.length > 0) {
                await interaction.reply({ content: `Removed the following roles from ${targetUser.tag}: ${removedRoles.join(', ')}.` });
            } else {
                await interaction.reply({ content: `${targetUser.tag} did not have any of the manageable roles to remove.` });
            }
        } catch (error) {
            logger.error('Error during REMOVE_ALL operation:', error);
            await interaction.reply({ content: 'An error occurred while trying to remove all roles.' });
        }
        return;
    }

    const roleConfig = config.roleHierarchy[targetRoleName];
    if (!roleConfig) {
        return interaction.reply({ content: `The role "${targetRoleName}" is not a manageable role.` });
    }

    const actionConfig = roleConfig[action];
    if (!actionConfig) {
        return interaction.reply({ content: `No configuration found for the "${action}" action on the "${targetRoleName}" role.` });
    }

    const addedRoles = [];
    const removedRoles = [];

    try {
        if (actionConfig.add) {
            for (const roleNameToAdd of actionConfig.add) {
                const role = findRole(interaction.guild, roleNameToAdd);
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                }
            }
        }

        if (actionConfig.remove) {
            for (const roleNameToRemove of actionConfig.remove) {
                const role = findRole(interaction.guild, roleNameToRemove);
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

        await interaction.reply({ content: replyMessage });

    } catch (error) {
        logger.error('Error managing roles:', error);
        await interaction.reply({ content: 'An error occurred while trying to manage roles.' });
    }
}

const findRole = (guild, roleName) => {
    return guild.roles.cache.find(r => r.name === roleName);
};

// ================================================================= //
// =================== CENTRALIZED PERMISSION CHECKS ================= //
// ================================================================= //

const hasRole = (member, roleListName) => {
    const config = configManager.get();
    if (!config || !config[roleListName]) {
        logger.warn(`Permission check failed: "${roleListName}" not found in config.`);
        return false;
    }
    const requiredRoles = config[roleListName];
    return member.roles.cache.some(role => requiredRoles.includes(role.name));
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

