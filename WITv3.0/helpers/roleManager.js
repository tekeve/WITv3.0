const { adminRoles } = require('../config');
const logger = require('./logger');
const { MessageFlags } = require('discord.js');
const charManager = require('./characterManager'); // Import characterManager

/**
 * Checks if a member has an admin role.
 * @param {import('discord.js').GuildMember} member - The guild member to check.
 * @returns {boolean} - True if the member has an admin role, false otherwise.
 */
const hasAdminRole = (member) => {
    if (!member.roles) {
        logger.warn('Member object does not have roles property.');
        return false;
    }
    return member.roles.cache.some(role => adminRoles.includes(role.name));
};

/**
 * Finds a role in the guild by its name.
 * @param {import('discord.js').Guild} guild - The guild to search in.
 * @param {string} roleName - The name of the role to find.
 * @returns {import('discord.js').Role|undefined} - The role object or undefined if not found.
 */
const findRole = (guild, roleName) => {
    return guild.roles.cache.find(r => r.name === roleName);
};

/**
 * Manages role changes for a user based on a defined hierarchy.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {'promote' | 'demote'} action - The action to perform ('promote' or 'demote').
 */
async function manageRoles(interaction, action) {
    const targetUser = interaction.options.getUser('user');
    const targetRoleName = interaction.options.getString('role'); // This is the key in our hierarchy
    let member = await interaction.guild.members.fetch(targetUser.id);
    const { roleHierarchy } = require('../config');

    if (!hasAdminRole(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }

    // Handle the special "Remove All" case
    if (action === 'demote' && targetRoleName === 'REMOVE_ALL') {
        const removedRoles = [];
        const manageableRoleNames = Object.keys(roleHierarchy);

        try {
            for (const roleName of manageableRoleNames) {
                const role = findRole(interaction.guild, roleName);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                    logger.info(`Removed role "${roleName}" from ${targetUser.tag} as part of REMOVE_ALL.`);
                }
            }

            // After all roles are removed, re-fetch the member, bypassing the cache
            const updatedMember = await interaction.guild.members.fetch({ user: targetUser.id, force: true });
            const finalRoles = updatedMember.roles.cache.map(r => r.name);
            await charManager.updateUserRoles(targetUser.id, finalRoles);


            if (removedRoles.length > 0) {
                await interaction.reply({ content: `Removed the following roles from ${targetUser.tag}: ${removedRoles.join(', ')}. Database has been updated.`, flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: `${targetUser.tag} did not have any of the manageable roles to remove.`, flags: [MessageFlags.Ephemeral] });
            }
        } catch (error) {
            logger.error('Error during REMOVE_ALL operation:', error);
            await interaction.reply({ content: 'An error occurred while trying to remove all roles.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    const roleConfig = roleHierarchy[targetRoleName];
    if (!roleConfig) {
        return interaction.reply({ content: `The role "${targetRoleName}" is not a manageable role.`, flags: [MessageFlags.Ephemeral] });
    }

    // Get the specific action configuration (promote or demote)
    const actionConfig = roleConfig[action];
    if (!actionConfig) {
        return interaction.reply({ content: `No configuration found for the "${action}" action on the "${targetRoleName}" role.`, flags: [MessageFlags.Ephemeral] });
    }

    const addedRoles = [];
    const removedRoles = [];

    try {
        // Add roles specified in the action config
        if (actionConfig.add) {
            for (const roleNameToAdd of actionConfig.add) {
                const role = findRole(interaction.guild, roleNameToAdd);
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                    logger.info(`Added role "${roleNameToAdd}" to ${targetUser.tag}`);
                } else if (!role) {
                    logger.warn(`Role to add not found: ${roleNameToAdd}`);
                }
            }
        }

        // Remove roles specified in the action config
        if (actionConfig.remove) {
            for (const roleNameToRemove of actionConfig.remove) {
                const role = findRole(interaction.guild, roleNameToRemove);
                if (role && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                    logger.info(`Removed role "${roleNameToRemove}" from ${targetUser.tag}`);
                } else if (!role) {
                    logger.warn(`Role to remove not found: ${roleNameToRemove}`);
                }
            }
        }

        // After making changes, re-fetch the member object, bypassing the cache
        const updatedMember = await interaction.guild.members.fetch({ user: targetUser.id, force: true });
        const finalRoles = updatedMember.roles.cache.map(r => r.name);
        await charManager.updateUserRoles(targetUser.id, finalRoles);

        let replyMessage = `Role changes for ${targetUser.tag} completed.\n`;
        if (addedRoles.length > 0) replyMessage += `> **Added:** ${addedRoles.join(', ')}\n`;
        if (removedRoles.length > 0) replyMessage += `> **Removed:** ${removedRoles.join(', ')}\n`;
        if (addedRoles.length === 0 && removedRoles.length === 0) {
            replyMessage = `No role changes were necessary for ${targetUser.tag}. They may already have the correct roles.`;
        } else {
            replyMessage += `> Database roles have been synced.`
        }

        await interaction.reply({ content: replyMessage, flags: [MessageFlags.Ephemeral] });

    } catch (error) {
        logger.error('Error managing roles:', error);
        await interaction.reply({ content: 'An error occurred while trying to manage roles. Please check my permissions and role hierarchy.', flags: [MessageFlags.Ephemeral] });
    }
}

module.exports = {
    manageRoles,
};

