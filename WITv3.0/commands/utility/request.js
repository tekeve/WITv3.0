const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');
const configManager = require('@helpers/configManager'); // Import config manager
const logger = require('@helpers/logger');

module.exports = {
    permission: 'commander',
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Submit a request ticket.')
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Describe your request in detail.')
                .setRequired(true)),

    async execute(interaction) {

        const config = configManager.get(); // Get latest config
        const requestChannelId = config.requestChannelId ? config.requestChannelId[0] : null;


        if (!requestChannelId) {
            logger.error('requestChannelId is not configured in the database.');
            return interaction.reply({ content: 'Error: The request channel is not configured correctly.', flags: [MessageFlags.Ephemeral] });
        }

        const requestDetails = interaction.options.getString('details');
        const requester = interaction.user;

        // Fetch the user's main character name from the database
        const charData = await charManager.getChars(requester.id);

        // FIX: Added a more robust check to ensure authorName is always a valid string.
        let authorName = charData?.main?.character_name;
        if (!authorName || typeof authorName !== 'string' || authorName.trim() === '') {
            authorName = requester.username;
        }

        const authorObject = { name: authorName };
        const authorIcon = requester.displayAvatarURL();
        if (authorIcon) {
            authorObject.iconURL = authorIcon;
        }

        const requestChannel = await interaction.client.channels.fetch(requestChannelId);
        if (!requestChannel) {
            return interaction.reply({ content: 'Error: The request channel could not be found.', flags: [MessageFlags.Ephemeral] });
        }

        const timestamp = Math.floor(Date.now() / 1000);

        const embed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange for 'Open'
            .setTitle('New Request Ticket')
            .setAuthor(authorObject)
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

