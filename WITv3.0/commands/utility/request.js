const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const roleManager = require('@helpers/roleManager');
const configManager = require('@helpers/configManager'); // Import config manager
const logger = require('@helpers/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Submit a request ticket.')
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Describe your request in detail.')
                .setRequired(true)),

    async execute(interaction) {
        // Use the centralized permission check
        if (!roleManager.isCommanderOrAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const config = configManager.get(); // Get latest config
        const requestChannelId = config.requestChannelId;

        if (!requestChannelId) {
            logger.error('requestChannelId is not configured in the database.');
            return interaction.reply({ content: 'Error: The request channel is not configured correctly.' });
        }

        const requestDetails = interaction.options.getString('details');
        const requester = interaction.user;

        // Fetch the user's main character name from the database
        const charData = await charManager.getChars(requester.id);
        const authorName = charData ? charData.main_character : requester.tag;

        const requestChannel = await interaction.client.channels.fetch(requestChannelId);
        if (!requestChannel) {
            return interaction.reply({ content: 'Error: The request channel could not be found.' });
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
