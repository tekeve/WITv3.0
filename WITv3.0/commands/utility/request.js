const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager'); // Import the character manager
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
        const requestDetails = interaction.options.getString('details');
        const requester = interaction.user;

        // Get the user's character data
        const charData = charManager.getChars(requester.id);
        // Use the main character name if it exists, otherwise fall back to the Discord tag
        const requesterName = charData && charData.mainChar ? charData.mainChar : requester.tag;

        const requestChannel = await interaction.client.channels.fetch(process.env.REQUEST_CHANNEL_ID);
        if (!requestChannel) {
            return interaction.reply({ content: 'Error: The request channel is not configured correctly.' });
        }

        // Get the current time as a Unix timestamp in seconds
        const timestamp = Math.floor(Date.now() / 1000);

        const embed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange for 'Open'
            .setTitle('New Request Ticket')
            // Use the determined name for the author
            .setAuthor({ name: requesterName, iconURL: requester.displayAvatarURL() })
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