const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const moderationManager = require('@helpers/moderationManager');
const logger = require('@helpers/logger');

// Durations in milliseconds for timeout command
const durationOptions = {
    '5 minutes': 5 * 60 * 1000,
    '10 minutes': 10 * 60 * 1000,
    '1 hour': 60 * 60 * 1000,
    '1 day': 24 * 60 * 60 * 1000,
    '3 days': 3 * 24 * 60 * 60 * 1000,
    '1 week': 7 * 24 * 60 * 60 * 1000,
};

module.exports = {
    permissions: ['leadership', 'officer', 'council'],
    data: new SlashCommandBuilder()
        .setName('moderation')
        .setDescription('Moderation tools for staff.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kicks a member from the server.')
                .addUserOption(option => option.setName('user').setDescription('The user to kick.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the kick.').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ban')
                .setDescription('Bans a member from the server.')
                .addUserOption(option => option.setName('user').setDescription('The user to ban.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the ban.').setRequired(false))
                .addIntegerOption(option =>
                    option.setName('delete_messages')
                        .setDescription('How much of their recent message history to delete.')
                        .addChoices(
                            { name: 'Don\'t delete any', value: 0 },
                            { name: 'Previous 24 hours', value: 86400 },
                            { name: 'Previous 7 days', value: 604800 }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('timeout')
                .setDescription('Times out a member, preventing them from interacting.')
                .addUserOption(option => option.setName('user').setDescription('The user to time out.').setRequired(true))
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('How long the timeout should last.')
                        .setRequired(true)
                        .addChoices(
                            { name: '5 Minutes', value: '300000' },
                            { name: '10 Minutes', value: '600000' },
                            { name: '1 Hour', value: '3600000' },
                            { name: '1 Day', value: '86400000' },
                            { name: '3 Days', value: '259200000' },
                            { name: '1 Week', value: '604800000' }
                        )
                )
                .addStringOption(option => option.setName('reason').setDescription('The reason for the timeout.').setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        await interaction.deferReply({ ephemeral: true });

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: 'That user is not in this server.' });
        }

        if (targetMember.id === interaction.client.user.id) {
            return interaction.editReply({ content: "I can't moderate myself!" });
        }

        if (targetMember.id === interaction.user.id) {
            return interaction.editReply({ content: 'You cannot moderate yourself.' });
        }

        // Role hierarchy check
        const executorInfo = await roleManager.getMemberHierarchyInfo(interaction.member);
        const targetInfo = await roleManager.getMemberHierarchyInfo(targetMember);

        if (executorInfo.level <= targetInfo.level && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.editReply({ content: "You cannot moderate a member with an equal or higher role." });
        }

        let responseEmbed;

        switch (subcommand) {
            case 'kick':
                if (!targetMember.kickable) {
                    return interaction.editReply({ content: "I don't have permission to kick this member. They may have a higher role than me." });
                }
                try {
                    await targetUser.send(`You have been kicked from **${interaction.guild.name}** for the following reason: \`${reason}\``).catch(() => {
                        logger.warn(`Could not DM user ${targetUser.tag} about their kick.`);
                    });
                    await targetMember.kick(reason);

                    const caseId = await moderationManager.logAction(interaction.guild.id, interaction.user.id, targetUser.id, 'kick', reason);

                    responseEmbed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('Member Kicked')
                        .setDescription(`**${targetUser.tag}** has been kicked.`)
                        .addFields(
                            { name: 'Reason', value: reason },
                            { name: 'Case ID', value: `#${caseId}` }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [responseEmbed] });
                } catch (error) {
                    logger.error('Error kicking member:', error);
                    return interaction.editReply({ content: 'An error occurred while trying to kick the member.' });
                }
                break;

            case 'ban':
                const deleteMessageSeconds = interaction.options.getInteger('delete_messages') ?? 0;
                if (!targetMember.bannable) {
                    return interaction.editReply({ content: "I don't have permission to ban this member. They may have a higher role than me." });
                }
                try {
                    await targetUser.send(`You have been banned from **${interaction.guild.name}** for the following reason: \`${reason}\``).catch(() => {
                        logger.warn(`Could not DM user ${targetUser.tag} about their ban.`);
                    });
                    await targetMember.ban({ reason, deleteMessageSeconds });

                    const caseId = await moderationManager.logAction(interaction.guild.id, interaction.user.id, targetUser.id, 'ban', reason);

                    responseEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('Member Banned')
                        .setDescription(`**${targetUser.tag}** has been banned.`)
                        .addFields(
                            { name: 'Reason', value: reason },
                            { name: 'Case ID', value: `#${caseId}` }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [responseEmbed] });
                } catch (error) {
                    logger.error('Error banning member:', error);
                    return interaction.editReply({ content: 'An error occurred while trying to ban the member.' });
                }
                break;

            case 'timeout':
                const duration = parseInt(interaction.options.getString('duration'), 10);
                if (!targetMember.moderatable) {
                    return interaction.editReply({ content: "I don't have permission to time out this member. They may have a higher role than me." });
                }
                try {
                    await targetMember.timeout(duration, reason);
                    const durationSeconds = duration / 1000;
                    const caseId = await moderationManager.logAction(interaction.guild.id, interaction.user.id, targetUser.id, 'timeout', reason, durationSeconds);
                    const expiryTimestamp = Math.floor((Date.now() + duration) / 1000);

                    responseEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('Member Timed Out')
                        .setDescription(`**${targetUser.tag}** has been timed out.`)
                        .addFields(
                            { name: 'Reason', value: reason },
                            { name: 'Expires', value: `<t:${expiryTimestamp}:R>` },
                            { name: 'Case ID', value: `#${caseId}` }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [responseEmbed] });
                } catch (error) {
                    logger.error('Error timing out member:', error);
                    return interaction.editReply({ content: 'An error occurred while trying to time out the member.' });
                }
                break;
        }
    },
};
