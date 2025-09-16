const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('refreshroles')
        .setDescription('Syncs the roles of all registered users from Discord to the database. (Admin Only)'),

    async execute(interaction) {

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const allUsers = await charManager.getAllUsers();
            if (allUsers.length === 0) {
                return interaction.editReply({ content: 'No users found in the database to refresh.' });
            }

            let successCount = 0;
            let failCount = 0;

            for (const user of allUsers) {
                try {
                    const member = await interaction.guild.members.fetch(user.discord_id);
                    // Switched to updating with role IDs for consistency.
                    const currentRoleIds = member.roles.cache.map(role => role.id);
                    await charManager.updateUserRoles(user.discord_id, currentRoleIds);
                    successCount++;
                } catch (error) {
                    // This likely means the user has left the server
                    logger.warn(`Could not fetch member with ID ${user.discord_id}. They may have left the server.`);
                    failCount++;
                }
            }

            await interaction.editReply({ content: `Role synchronization complete.\n\nSuccessfully updated: **${successCount}** users.\nCould not find: **${failCount}** users (they may have left the server).` });

        } catch (error) {
            logger.error('An error occurred during the role refresh process:', error);
            await interaction.editReply({ content: 'A critical error occurred while refreshing roles. Please check the logs.' });
        }
    },
};
