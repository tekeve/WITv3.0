const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { adminRoles, demotions } = require('../../config.js');
const logger = require('@helpers/logger');

// Dynamically create choices for the demotion option from the config
const demotionChoices = Object.keys(demotions.roleSets).map(key => ({
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format 'fleet_commander' to 'Fleet Commander'
    value: key
}));

// Add the 'all' option to the choices
demotionChoices.push({ name: 'All Ranks', value: 'all' });

module.exports = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Demotes a user from a specific rank or removes all ranks.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to demote.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('The rank to demote the user from, or "All Ranks".')
                .setRequired(true)
                .addChoices(...demotionChoices)
        ),

    async execute(interaction) {
        // 1. PERMISSION CHECK
        if (!interaction.member.roles.cache.some(role => adminRoles.includes(role.name))) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // 2. GET INPUTS
        const demotionName = interaction.options.getString('rank');
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const formattedRoleName = demotionName.replace(/_/g, ' ');

        if (!targetMember) {
            return interaction.editReply({ content: 'Could not find that user in the server.' });
        }

        // 3. HANDLE 'ALL' DEMOTION
        if (demotionName === 'all') {
            const rolesToRemoveNames = demotions.allManagedRoles || [];
            if (rolesToRemoveNames.length === 0) {
                return interaction.editReply({ content: 'Error: `allManagedRoles` is not defined in the config. Cannot perform demotion.' });
            }

            const rolesToRemove = [];
            for (const roleName of rolesToRemoveNames) {
                const role = interaction.guild.roles.cache.find(r => r.name === roleName);
                if (role) {
                    rolesToRemove.push(role);
                } else {
                    logger.warn(`Could not find role '${roleName}' from 'allManagedRoles' list to remove.`);
                }
            }

            if (rolesToRemove.length > 0) {
                await targetMember.roles.remove(rolesToRemove);
                await interaction.editReply({ content: `Successfully removed all managed roles from ${targetUser.tag}.` });
            } else {
                await interaction.editReply({ content: `No roles to remove from ${targetUser.tag}. They do not have any of the managed roles.` });
            }
            return;
        }

        // 4. HANDLE SPECIFIC RANK DEMOTION
        const demotionConfig = demotions.roleSets[demotionName];
        const rolesToAdd = [];
        const rolesToRemove = [];
        let notFoundAdd = [];
        let notFoundRemove = [];

        // Find roles to add
        const roleNamesToAdd = demotionConfig.add || [];
        for (const roleName of roleNamesToAdd) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                rolesToAdd.push(role);
            } else {
                notFoundAdd.push(roleName);
            }
        }

        // Find roles to remove
        const roleNamesToRemove = demotionConfig.remove || [];
        for (const roleName of roleNamesToRemove) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                rolesToRemove.push(role);
            } else {
                notFoundRemove.push(roleName);
            }
        }

        if (notFoundAdd.length > 0) {
            logger.warn(`Could not find the following roles to add during demotion: ${notFoundAdd.join(', ')}`);
        }
        if (notFoundRemove.length > 0) {
            logger.warn(`Could not find the following roles to remove during demotion: ${notFoundRemove.join(', ')}`);
        }

        if (rolesToRemove.length === 0) {
            return interaction.editReply({ content: `Error: None of the roles to remove for the '${formattedRoleName}' demotion could be found. Please check the config.` });
        }

        // Perform the role updates
        if (rolesToAdd.length > 0) {
            await targetMember.roles.add(rolesToAdd);
        }
        await targetMember.roles.remove(rolesToRemove);

        // 5. SEND CONFIRMATION
        const confirmationMessage = `Successfully demoted ${targetUser.tag} from the **${formattedRoleName}** rank.`;
        await interaction.editReply({ content: confirmationMessage });
    },
};

