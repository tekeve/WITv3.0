const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('@helpers/database'); // Assuming database helper path
const logger = require('@helpers/logger');
const scheduler = require('@helpers/scheduler');
const { parse, add } = require('date-fns');

module.exports = {
    // Custom permissions property for your command handler
    permissions: ['council'],

    // Autocomplete property, set to null as this command doesn't use it
    autocomplete: null,

    data: new SlashCommandBuilder()
        .setName('start-vote')
        .setDescription('Starts a new anonymous STV vote.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('leadership')
                .setDescription('Start a leadership election (1 winner).')
                .addStringOption(option => option.setName('title').setDescription('The title of the election').setRequired(true))
                .addStringOption(option => option.setName('candidates').setDescription('Comma-separated list of candidates (e.g., "UserA, UserB, UserC")').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., "7d", "3h"). Default: 7d').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('officer')
                .setDescription('Start an officer election (2 winners).')
                .addStringOption(option => option.setName('title').setDescription('The title of the election').setRequired(true))
                .addStringOption(option => option.setName('candidates').setDescription('Comma-separated list of candidates').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., "7d", "3h"). Default: 7d').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('other')
                .setDescription('Start any other vote (1 winner).')
                .addStringOption(option => option.setName('title').setDescription('The title of the vote').setRequired(true))
                .addStringOption(option => option.setName('candidates').setDescription('Comma-separated list of options').setRequired(true))
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., "7d", "3h"). Default: 7d').setRequired(false))
        ),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        // Defer reply as DB operations can take time
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const title = interaction.options.getString('title');
        const candidatesStr = interaction.options.getString('candidates');
        const durationStr = interaction.options.getString('duration') || '7d'; // Default 7 days

        // Check for existing active vote in this channel
        try {
            // FIX: Changed `const [existing]` to `const existing`
            const existing = await db.query('SELECT vote_id FROM votes WHERE channel_id = ? AND is_active = 1', [interaction.channelId]);
            if (existing.length > 0) {
                return interaction.editReply({ content: 'There is already an active vote in this channel. Please wait for it to conclude before starting a new one.', ephemeral: true });
            }

            const candidates = candidatesStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
            if (candidates.length < 2) {
                return interaction.editReply({ content: 'You must provide at least two candidates/options.', ephemeral: true });
            }

            // Parse duration
            const durationAmount = parseInt(durationStr.slice(0, -1));
            const durationUnit = durationStr.slice(-1);
            let durationOptions = {};

            if (durationUnit === 'd') durationOptions.days = durationAmount;
            else if (durationUnit === 'h') durationOptions.hours = durationAmount;
            else if (durationUnit === 'm') durationOptions.minutes = durationAmount;
            else return interaction.editReply({ content: 'Invalid duration format. Use "d" for days, "h" for hours, "m" for minutes.', ephemeral: true });

            const endTime = add(new Date(), durationOptions);

            // Insert vote into DB
            // FIX: This one IS correct, as `result` is not an array of rows
            const result = await db.query(
                'INSERT INTO votes (guild_id, channel_id, title, type, candidates, end_time, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [interaction.guildId, interaction.channelId, title, subcommand, JSON.stringify(candidates), endTime, 1]
            );

            const voteId = result.insertId;

            // Schedule the tallying job
            await scheduler.scheduleJob(voteId, endTime, 'tallyVote');

            logger.info(`New vote started: ${title} (ID: ${voteId}) in channel ${interaction.channelId}, ending at ${endTime.toISOString()}`);

            // Public confirmation
            await interaction.channel.send({
                content: `**New Vote Started!**\n\n## ${title}\n\nThis vote is for \`${subcommand}\` and will conclude in ${durationStr} (at <t:${Math.floor(endTime.getTime() / 1000)}:F>).\n\n**Candidates:**\n- ${candidates.join('\n- ')}\n\nUse the \`/vote\` command in this channel to receive your private, anonymous voting link via DM.`
            });

            // Ephemeral confirmation to the admin
            return interaction.editReply({ content: `Vote successfully created with ID: ${voteId}. The end job has been scheduled.`, ephemeral: true });

        } catch (error) {
            logger.error('Error starting vote:', error);
            return interaction.editReply({ content: 'An error occurred while starting the vote. Please check the logs.', ephemeral: true });
        }
    },
};