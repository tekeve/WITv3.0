const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const statusManager = require('@helpers/statusManager'); // Import the new manager
const logger = require('@helpers/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Manage the bot\'s custom status (Admin Only).')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Sets a new status for the bot.')
                .addStringOption(option =>
                    option.setName('activity')
                        .setDescription('The type of activity.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Playing', value: 'Playing' },
                            { name: 'Watching', value: 'Watching' },
                            { name: 'Listening', value: 'Listening' },
                            { name: 'Streaming', value: 'Streaming' }
                        ))
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('The status message to display.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('expiry')
                        .setDescription('How long the status should last.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Never', value: '0' },
                            { name: '1 Hour', value: '3600000' },
                            { name: '12 Hours', value: '43200000' },
                            { name: '1 Day', value: '86400000' },
                            { name: '1 Week', value: '604800000' }
                        ))
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('The URL for the streaming status (e.g., Twitch/YouTube).'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clears the bot\'s current custom status.')
        ),

    async execute(interaction) {
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'clear') {
            await statusManager.clearStatus(interaction.client);
            return interaction.reply({
                content: 'Bot status has been cleared.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'set') {
            const activity = interaction.options.getString('activity');
            const status = interaction.options.getString('status');
            const expiryDuration = parseInt(interaction.options.getString('expiry'), 10);
            const url = interaction.options.getString('url');

            // Validate Streaming URL
            if (activity === 'Streaming' && (!url || (!url.startsWith('https://www.twitch.tv/') && !url.startsWith('https://www.youtube.com/')))) {
                return interaction.reply({
                    content: 'A valid Twitch or YouTube URL is required for the "Streaming" activity type.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const expiryTimestamp = expiryDuration > 0 ? Date.now() + expiryDuration : null;

            await statusManager.setStatus(interaction.client, activity, status, url, expiryTimestamp);

            let expiryText = expiryTimestamp ? `and will expire <t:${Math.floor(expiryTimestamp / 1000)}:R>` : "with no expiry";
            let replyMessage = `Bot status has been updated to: **${activity} ${status}** ${expiryText}.`;

            if (url && activity === 'Streaming') {
                replyMessage += ` at ${url}`;
            }

            await interaction.reply({
                content: replyMessage,
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};
