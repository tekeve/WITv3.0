const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const { adminRoles, commanderRoles } = require('../../config.js');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Submit a request ticket.')
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Describe your request in detail.')
                .setRequired(true)),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role =>
            adminRoles.includes(role.name) || commanderRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const requestDetails = interaction.options.getString('details');
        const requester = interaction.user;

        // Fetch the user's main character name from the database
        const charData = await charManager.getChars(requester.id);
        const authorName = charData ? charData.main_character : requester.tag;

        const requestChannel = await interaction.client.channels.fetch(process.env.REQUEST_CHANNEL_ID);
        if (!requestChannel) {
            return interaction.reply({ content: 'Error: The request channel is not configured correctly.', flags: [MessageFlags.Ephemeral] });
        }

        const timestamp = Math.floor(Date.now() / 1000);

        const embed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange for 'Open'
            .setTitle('New Request Ticket')
            .setAuthor({ name: authorName, iconURL: requester.displayAvatarURL() })
            .setDescription(requestDetails)
            .addFields(
                { name: 'Status', value: 'Open', inline: true },
                { name: 'Created On', value: `<t:${timestamp}:f>`, inline: true }
            );

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_solve')
                    .setLabel('Solve')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('ticket_deny')
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        await requestChannel.send({ embeds: [embed], components: [buttons] });

        await interaction.reply({ content: 'Your request has been submitted successfully!', flags: [MessageFlags.Ephemeral] });
    },
};

