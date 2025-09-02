const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { adminRoles, promotions } = require('../../config.js');
const logger = require('@helpers/logger');
const charManager = require('@helpers/characterManager');

// Dynamically create choices for the promotion option from the config
const promotionChoices = Object.keys(promotions.roleSets).map(key => ({
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format 'fleet_commander' to 'Fleet Commander'
    value: key
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promotes a user to a new role set and sends a notification.')
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
        const promotionName = interaction.options.getString('rank'); // Get the selected rank from the string option
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const formattedRoleName = promotionName.replace(/_/g, ' ');

        if (!targetMember) {
            return interaction.editReply({ content: 'Could not find that user in the server.' });
        }

        // 3. FIND AND MANAGE ROLES
        const promotionConfig = promotions.roleSets[promotionName];
        const rolesToAdd = [];
        const rolesToRemove = [];
        let notFoundRoles = [];

        // Find roles to add
        const roleNamesToAdd = promotionConfig.add || [];
        for (const roleName of roleNamesToAdd) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                rolesToAdd.push(role);
            } else {
                notFoundRoles.push(roleName);
            }
        }

        // Find roles to remove
        const roleNamesToRemove = promotionConfig.remove || [];
        for (const roleName of roleNamesToRemove) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                rolesToRemove.push(role);
            } else {
                logger.warn(`Could not find role '${roleName}' to remove.`);
            }
        }

        if (notFoundRoles.length > 0) {
            logger.warn(`Could not find the following roles to assign: ${notFoundRoles.join(', ')}`);
        }

        if (rolesToAdd.length === 0) {
            return interaction.editReply({ content: `Error: None of the roles for the '${formattedRoleName}' promotion could be found. Please check the config.` });
        }

        // Perform the role updates
        await targetMember.roles.add(rolesToAdd);
        if (rolesToRemove.length > 0) {
            await targetMember.roles.remove(rolesToRemove);
        }

        // 4. PREPARE AND SEND THE DIRECT MESSAGE
        const notificationInfo = promotions.notificationInfo[promotionName];
        if (notificationInfo) {
            const channel = interaction.guild.channels.cache.get(notificationInfo.channelId);
            const channelLink = channel ? `<#${channel.id}>` : 'the relevant channels';

            const promoterCharData = charManager.getChars(interaction.user.id);
            const promoterName = promoterCharData ? promoterCharData.mainChar : interaction.user.tag;

            const welcomeEmbed = new EmbedBuilder()
                .setColor(0x3BA55D) // Green
                .setTitle(`🎉 Congratulations! You've been promoted!`)
                .setDescription(`You have been promoted to **${formattedRoleName}** in the ${interaction.guild.name} server.`)
                .addFields({ name: 'Next Steps', value: `${notificationInfo.message} You can find more information in ${channelLink}.` })
                .setTimestamp()
                .setFooter({ text: `Promoted by: ${promoterName}` });

            let dmSent = true;
            try {
                await targetUser.send({ embeds: [welcomeEmbed] });
            } catch (error) {
                logger.error(`Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`);
                dmSent = false;
            }

            const confirmationMessage = `Successfully promoted ${targetUser.tag} to **${formattedRoleName}**.`
                + (dmSent ? ' A notification DM has been sent.' : ' **Warning:** Could not send a notification DM as their DMs are likely private.');
            await interaction.editReply({ content: confirmationMessage });

        } else {
            await interaction.editReply({ content: `Successfully promoted ${targetUser.tag} to **${formattedRoleName}**, but no DM was sent as it is not configured.` });
        }
    },
};