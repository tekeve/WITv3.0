const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');
const logger = require('@helpers/logger');

module.exports = {
    permission: ['leadership'],
    data: new SlashCommandBuilder()
        .setName('refreshroles')
        .setDescription('Forces a sync of roles from the database to Discord for registered users. (Leadership Only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Optional: A specific user to refresh.')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        await interaction.deferReply();

        if (targetUser) {
            // Refreshing a single user
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);

                // Sync roles from DB to Discord and get a report of changes and discrepancies
                const { added, removed, discrepancies } = await roleManager.syncRolesFromDb(member);

                let replyMessage = `Role sync for **${targetUser.tag}** completed.\n`;

                if (added.length === 0 && removed.length === 0) {
                    replyMessage += `No changes were needed. Roles are already in sync with the database.`;
                } else {
                    if (added.length > 0) replyMessage += `> **Added:** ${added.join(', ')}\n`;
                    if (removed.length > 0) replyMessage += `> **Removed:** ${removed.join(', ')}\n`;
                }

                if (discrepancies) {
                    replyMessage += `\n\n**⚠️ Warning: A discrepancy was found after syncing!**`;
                    if (discrepancies.missing.length > 0) {
                        replyMessage += `\n- The following roles **could not be added**: ${discrepancies.missing.join(', ')}`;
                    }
                    if (discrepancies.extra.length > 0) {
                        replyMessage += `\n- The following roles **could not be removed**: ${discrepancies.extra.join(', ')}`;
                    }
                    replyMessage += `\nThis usually indicates a permissions issue. Please check the bot's role hierarchy in Discord's settings.`;
                }

                await interaction.editReply({ content: replyMessage });

            } catch (error) {
                logger.error(`Failed to refresh roles for single user ${targetUser.id}:`, error);
                await interaction.editReply({ content: `Could not refresh roles for **${targetUser.tag}**. They may have left the server.` });
            }
        } else {
            // Refreshing all users
            try {
                const allUsers = await charManager.getAllUsers();
                if (allUsers.length === 0) {
                    return interaction.editReply({ content: 'No users found in the database to refresh.' });
                }

                let successCount = 0;
                let failCount = 0;
                const totalUsers = allUsers.length;

                await interaction.editReply({ content: `Starting role sync for **${totalUsers}** registered users...` });

                // Sync from DB to Discord for all users
                for (const user of allUsers) {
                    try {
                        const member = await interaction.guild.members.fetch(user.discord_id);
                        await roleManager.syncRolesFromDb(member); // Discrepancies are logged automatically by the function
                        successCount++;
                    } catch (error) {
                        logger.warn(`Could not fetch member with ID ${user.discord_id}. They may have left the server.`);
                        failCount++;
                    }
                }

                await interaction.followUp({
                    content: `Bulk role synchronization complete.\n\nSuccessfully synced: **${successCount}** users.\nCould not find/sync: **${failCount}** users (they may have left the server).`,
                });

            } catch (error) {
                logger.error('An error occurred during the bulk role refresh process:', error);
                await interaction.editReply({ content: 'A critical error occurred while refreshing roles. Please check the logs.' });
            }
        }
    },
};
