const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const reminderManager = require('@helpers/reminderManager');
const logger = require('@helpers/logger');

/**
 * Parses a time string like "1d 2h 30m" into milliseconds.
 * @param {string} timeString The string to parse.
 * @returns {number|null} The duration in milliseconds, or null if invalid.
 */
function parseDuration(timeString) {
    const regex = /(\d+)\s*(d|h|m|s)/gi;
    let totalMilliseconds = 0;
    let match;
    let foundMatch = false;

    while ((match = regex.exec(timeString)) !== null) {
        foundMatch = true;
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

    return foundMatch ? totalMilliseconds : null;
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
                    option.setName('ephemeral')
                        .setDescription('Show this confirmation only to you? (Default: True)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View all of your current reminders.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a specific reminder by its ID.')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('The ID of the reminder to delete.')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Delete all of your reminders.')),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'id') {
            const reminders = await reminderManager.getReminders(interaction.user.id);
            const choices = reminders.map(r => ({
                name: `ID: ${r.id} | In ${new Date(r.remind_at).toLocaleTimeString()} | "${r.reminder_text.substring(0, 50)}..."`,
                value: r.id
            })).slice(0, 25); // Limit to 25 choices for Discord API
            await interaction.respond(choices);
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        switch (subcommand) {
            case 'add': {
                const when = interaction.options.getString('when');
                const message = interaction.options.getString('message');
                const isPrivate = interaction.options.getBoolean('private') ?? false;
                const isEphemeral = interaction.options.getBoolean('ephemeral') ?? true;

                await interaction.deferReply({ ephemeral: isEphemeral });

                const duration = parseDuration(when);
                if (duration === null || duration <= 0) {
                    return interaction.editReply({ content: 'Invalid time format. Please use a format like `1d`, `2h 30m`, or `10m`.', ephemeral: true });
                }

                if (message.length > 1024) {
                    return interaction.editReply({ content: 'Reminder message cannot be longer than 1024 characters.', ephemeral: true });
                }

                const remindAt = Date.now() + duration;

                try {
                    const newReminder = await reminderManager.addReminder(user.id, interaction.channel.id, remindAt, message, isPrivate);
                    reminderManager.scheduleReminder(interaction.client, newReminder);

                    const remindTimestamp = Math.floor(remindAt / 1000);
                    const destination = isPrivate ? 'via DM' : 'in this channel';
                    await interaction.editReply({ content: `✅ Got it! I will remind you ${destination} on <t:${remindTimestamp}:f> (<t:${remindTimestamp}:R>).`, ephemeral: isEphemeral });
                } catch (error) {
                    logger.error('Failed to add reminder:', error);
                    await interaction.editReply({ content: 'A database error occurred while setting your reminder.', ephemeral: true });
                }
                break;
            }
            case 'list': {
                await interaction.deferReply({ ephemeral: true });
                const reminders = await reminderManager.getReminders(user.id);
                if (reminders.length === 0) {
                    return interaction.editReply({ content: 'You have no active reminders.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`Your ${reminders.length} Active Reminder(s)`)
                    .setDescription(reminders.map(r => {
                        const remindTimestamp = Math.floor(r.remind_at / 1000);
                        return `**ID:** \`${r.id}\` - Due <t:${remindTimestamp}:R>\n> ${r.reminder_text}`;
                    }).join('\n\n'))
                    .setFooter({ text: 'Use /remindme delete to remove a reminder.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed], ephemeral: true });
                break;
            }
            case 'delete': {
                await interaction.deferReply({ ephemeral: true });
                const reminderId = interaction.options.getInteger('id');
                const success = await reminderManager.deleteReminder(reminderId, user.id);
                if (success) {
                    await interaction.editReply({ content: `Reminder with ID \`${reminderId}\` has been deleted.`, ephemeral: true });
                } else {
                    await interaction.editReply({ content: `Could not find a reminder with ID \`${reminderId}\` that you own, or it may have already been sent.`, ephemeral: true });
                }
                break;
            }
            case 'clear': {
                await interaction.deferReply({ ephemeral: true });
                const count = await reminderManager.deleteAllReminders(user.id);
                if (count > 0) {
                    await interaction.editReply({ content: `Successfully deleted all ${count} of your reminders.`, ephemeral: true });
                } else {
                    await interaction.editReply({ content: 'You had no active reminders to delete.', ephemeral: true });
                }
                break;
            }
        }
    },
};

