const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const reminderManager = require('@helpers/reminderManager');
const logger = require('@helpers/logger');

/**
 * Parses a duration string (e.g., "1d 2h 30m") into milliseconds.
 * @param {string} timeString The string to parse.
 * @returns {number|null} Duration in milliseconds, or null if invalid.
 */
function parseDuration(timeString) {
    const regex = /(\d+)\s*(d|h|m|s)/gi;
    let totalMilliseconds = 0;
    let match;

    if (!timeString) return null;

    while ((match = regex.exec(timeString)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'd':
                totalMilliseconds += value * 24 * 60 * 60 * 1000;
                break;
            case 'h':
                totalMilliseconds += value * 60 * 60 * 1000;
                break;
            case 'm':
                totalMilliseconds += value * 60 * 1000;
                break;
            case 's':
                totalMilliseconds += value * 1000;
                break;
        }
    }

    return totalMilliseconds > 0 ? totalMilliseconds : null;
}

module.exports = {
    permission: 'public',
    data: new SlashCommandBuilder()
        .setName('remindme')
        .setDescription('Set, view, or delete your reminders.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Sets a new reminder for you.')
                .addStringOption(option =>
                    option.setName('when')
                        .setDescription('When to be reminded (e.g., 2h 30m, 10m, 1d).')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The content of the reminder.')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('private')
                        .setDescription('Send the reminder in a DM instead of this channel? (Default: False)'))
                .addBooleanOption(option =>
                    option.setName('show_publicly')
                        .setDescription('Show this confirmation message publicly? (Default: False)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists your upcoming reminders.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes a specific reminder.')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The ID of the reminder to delete (from /remindme list).')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Deletes all of your reminders.')),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const reminders = await reminderManager.getReminders(interaction.user.id);
        const choices = reminders
            .map(r => ({
                name: `ID: ${r.id} | In ${r.is_private ? 'DM' : 'channel'} | "${r.reminder_text.substring(0, 50)}..."`,
                value: r.id
            }))
            .filter(choice => choice.name.includes(focusedValue)); // Simple filter
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        switch (subcommand) {
            case 'add': {
                const when = interaction.options.getString('when');
                const message = interaction.options.getString('message');
                const isPrivate = interaction.options.getBoolean('private') ?? false;
                const showPublicly = interaction.options.getBoolean('show_publicly') ?? false;

                const replyOptions = {};
                // The reply should be ephemeral (only visible to the user) unless they explicitly set it to be public.
                if (!showPublicly) {
                    replyOptions.flags = [MessageFlags.Ephemeral];
                }

                await interaction.deferReply(replyOptions);

                const duration = parseDuration(when);
                if (!duration) {
                    // This reply must be ephemeral so other users don't see the error.
                    return interaction.editReply({ content: 'Invalid time format. Please use a format like `1d 2h 30m`.', flags: [MessageFlags.Ephemeral] });
                }

                if (message.length > 1000) {
                    return interaction.editReply({ content: 'Your reminder message cannot be longer than 1000 characters.', flags: [MessageFlags.Ephemeral] });
                }

                const remindAt = Date.now() + duration;

                try {
                    const newReminder = await reminderManager.addReminder(user.id, interaction.channel.id, remindAt, message, isPrivate);
                    reminderManager.scheduleReminder(interaction.client, newReminder);

                    const remindTimestamp = Math.floor(remindAt / 1000);
                    const destination = isPrivate ? 'via DM' : 'in this channel';
                    // The ephemeral state is inherited from deferReply, so no need to set it again here.
                    await interaction.editReply({ content: `✅ Got it! I will remind you ${destination} on <t:${remindTimestamp}:f> (<t:${remindTimestamp}:R>).` });
                } catch (error) {
                    logger.error('Failed to add reminder:', error);
                    await interaction.editReply({ content: 'A database error occurred while setting your reminder.', flags: [MessageFlags.Ephemeral] });
                }
                break;
            }
            case 'list': {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const reminders = await reminderManager.getReminders(user.id);
                if (reminders.length === 0) {
                    return interaction.editReply({ content: 'You have no upcoming reminders.' });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Your Upcoming Reminders')
                    .setDescription(reminders.map(r => {
                        const remindTimestamp = Math.floor(r.remind_at / 1000);
                        const destination = r.is_private ? 'DM' : 'Channel';
                        return `**ID:** ${r.id} | **When:** <t:${remindTimestamp}:R> | **Where:** ${destination}\n> ${r.reminder_text.substring(0, 200)}`;
                    }).join('\n\n'))
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                break;
            }
            case 'delete': {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const reminderId = interaction.options.getInteger('id');
                const success = await reminderManager.deleteReminder(reminderId, user.id);

                if (success) {
                    await interaction.editReply({ content: '✅ Reminder deleted successfully.' });
                } else {
                    await interaction.editReply({ content: '❌ Could not find a reminder with that ID, or it does not belong to you.' });
                }
                break;
            }
            case 'clear': {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const deletedCount = await reminderManager.deleteAllReminders(user.id);
                await interaction.editReply({ content: `✅ Successfully deleted ${deletedCount} reminder(s).` });
                break;
            }
        }
    },
};

