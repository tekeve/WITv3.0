const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { adminRoles, promotions } = require('../../config.js');
const logger = require('@helpers/logger');

// Dynamically create choices for the promotion option from the config
const promotionChoices = Object.keys(promotions.roleSets).map(key => ({
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format 'fleet_commander' to 'Fleet Commander'
    value: key
}));

// A helper function for creating a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promotes a user to a specific rank.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to promote.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('The rank to promote the user to.')
                .setRequired(true)
                .addChoices(...promotionChoices)
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
        const promotionName = interaction.options.getString('rank');
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const formattedRoleName = promotionName.replace(/_/g, ' ');

        if (!targetMember) {
            return interaction.editReply({ content: 'Could not find that user in the server.' });
        }

        // 3. RESOLVE ROLE CHANGES & DELAY
        const promotionConfig = promotions.roleSets[promotionName];
        const roleNamesToAdd = promotionConfig.add || [];
        const roleNamesToRemove = promotionConfig.remove || [];
        // Get delay from config, default to 2 seconds if not set
        const promotionDelayMs = promotions.promotionDelay || 2000;

        const rolesToAdd = [];
        const rolesToRemove = [];
        let notFoundAdd = [];
        let notFoundRemove = [];

        // Find role objects to add
        for (const roleName of roleNamesToAdd) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) rolesToAdd.push(role);
            else notFoundAdd.push(roleName);
        }

        // Find role objects to remove
        for (const roleName of roleNamesToRemove) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) rolesToRemove.push(role);
            else notFoundRemove.push(roleName);
        }

        if (notFoundAdd.length > 0) logger.warn(`Could not find roles to add: ${notFoundAdd.join(', ')}`);
        if (notFoundRemove.length > 0) logger.warn(`Could not find roles to remove: ${notFoundRemove.join(', ')}`);

        if (rolesToAdd.length === 0) {
            return interaction.editReply({ content: `Error: Could not find any valid roles to add for the '${formattedRoleName}' promotion. Please check the config.` });
        }

        // 4. APPLY ROLE CHANGES WITH DELAY
        try {
            if (rolesToAdd.length > 0) {
                logger.info(`Adding roles: ${rolesToAdd.map(r => r.name).join(', ')}`);
                await targetMember.roles.add(rolesToAdd);
                logger.success('Successfully added new roles.');
            }

            logger.info(`Waiting for ${promotionDelayMs}ms before removing old roles...`);
            await delay(promotionDelayMs);

            if (rolesToRemove.length > 0) {
                logger.info(`Removing roles: ${rolesToRemove.map(r => r.name).join(', ')}`);
                await targetMember.roles.remove(rolesToRemove);
                logger.success('Successfully removed old roles.');
            }

        } catch (error) {
            logger.error('Failed to update roles:', error);
            return interaction.editReply({ content: 'An error occurred while updating roles. Please check my permissions and role hierarchy.' });
        }

        // 5. PREPARE AND SEND THE DIRECT MESSAGE
        const notificationConfig = promotions.notificationInfo[promotionName];
        const submitterCharData = charManager.getChars(interaction.user.id);
        const promoterName = submitterCharData ? submitterCharData.mainChar : interaction.user.tag;

        const promotionEmbed = new EmbedBuilder()
            .setColor(0x3BA55D)
            .setTitle(`🎉 You have been promoted in ${interaction.guild.name}!`)
            .setDescription(notificationConfig.message || `Congratulations on your promotion to ${formattedRoleName}!`)
            .addFields({ name: 'More Information', value: `Please visit the <#${notificationConfig.channelId}> channel.` })
            .setTimestamp()
            .setFooter({ text: `Promoted by: ${promoterName}` });

        let dmSent = true;
        try {
            await targetUser.send({ embeds: [promotionEmbed] });
        } catch (error) {
            logger.error(`Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`);
            dmSent = false;
        }

        // 6. SEND CONFIRMATION
        const confirmationMessage = `Successfully promoted ${targetUser.tag} to **${formattedRoleName}**. `
            + (dmSent ? 'A notification DM has been sent.' : ' **Warning:** Could not send a notification DM as their DMs are likely private.');

        await interaction.editReply({ content: confirmationMessage });
    },
};

