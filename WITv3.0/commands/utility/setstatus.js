const { SlashCommandBuilder, MessageFlags, ActivityType } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const logger = require('@helpers/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Sets the bot\'s custom status (Admin Only).')
        .addStringOption(option =>
            option.setName('activity')
                .setDescription('The type of activity.')
                .setRequired(true)
                .addChoices(
                    { name: 'Playing', value: 'Playing' },
                    { name: 'Watching', value: 'Watching' },
                    { name: 'Listening to', value: 'Listening' },
                    { name: 'Streaming', value: 'Streaming' }
                ))
        .addStringOption(option =>
            option.setName('status')
                .setDescription('The status message to display.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL for the streaming status (e.g., Twitch/YouTube).')),

    async execute(interaction) {
        // Permission Check using the centralized roleManager
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const activityTypeString = interaction.options.getString('activity');
        const status = interaction.options.getString('status');
        const url = interaction.options.getString('url');

        let activityType;
        switch (activityTypeString) {
            case 'Playing':
                activityType = ActivityType.Playing;
                break;
            case 'Watching':
                activityType = ActivityType.Watching;
                break;
            case 'Listening':
                activityType = ActivityType.Listening;
                break;
            case 'Streaming':
                activityType = ActivityType.Streaming;
                break;
        }

        if (activityType === ActivityType.Streaming && (!url || (!url.startsWith('https://www.twitch.tv/') && !url.startsWith('https://www.youtube.com/')))) {
            return interaction.reply({
                content: 'A valid Twitch or YouTube URL is required for the "Streaming" activity type.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const activityOptions = {
            type: activityType,
        };

        if (url && activityType === ActivityType.Streaming) {
            activityOptions.url = url;
        }

        try {
            await interaction.client.user.setActivity(status, activityOptions);
            let replyMessage = `Bot status has been updated to: **${activityTypeString} ${status}**`;
            if (url && activityType === ActivityType.Streaming) {
                replyMessage += ` at ${url}`;
            }
            await interaction.reply({
                content: replyMessage,
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            logger.error('Failed to set bot status:', error);
            await interaction.reply({
                content: 'An error occurred while setting the bot status.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};

