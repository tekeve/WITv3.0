const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getSheetsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('commanderlist')
        .setDescription('Updates the Google Sheet with the current list of commanders and provides a report.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // --- 1. Authenticate and Prepare Google Sheets API ---
            logger.info('Connecting to Google Sheets API...');
            const sheets = await getSheetsService();
            const config = configManager.get();
            const spreadsheetId = config.googleSheets['CommandCoreList'];

            if (!spreadsheetId) {
                logger.error('Spreadsheet ID for alias "CommandCoreList" not found in config.');
                return interaction.editReply('Error: The spreadsheet alias "CommandCoreList" is not configured correctly.');
            }

            const sheetName = 'DiscordPull';
            const range = `${sheetName}!A2:J`;

            // --- 2. Read Existing Data from the Sheet for Comparison ---
            logger.info(`Reading existing data from ${sheetName} for comparison...`);
            const oldData = new Map();
            const roleListArray = ["fleet commander", "training fc", "line commander", "resident", "commander"];
            try {
                const getResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range,
                });

                const oldValues = getResponse.data.values || [];
                roleListArray.forEach((roleName, index) => {
                    const nameColumnIndex = index * 2 + 1;
                    if (oldValues[nameColumnIndex]) {
                        oldData.set(roleName, new Set(oldValues[nameColumnIndex]));
                    } else {
                        oldData.set(roleName, new Set());
                    }
                });
                logger.success('Successfully read existing sheet data.');
            } catch (err) {
                logger.warn(`Could not read old sheet data (maybe it's empty?), proceeding. Error: ${err.message}`);
                roleListArray.forEach(roleName => oldData.set(roleName, new Set()));
            }

            // --- 3. Fetch Fresh Data from Discord ---
            logger.info('Fetching fresh role data from Discord...');
            const wtmGuild = interaction.client.guilds.cache.get('295568584409743361');
            if (!wtmGuild) {
                return interaction.editReply('Error: Could not find the target Discord server.');
            }

            logger.info('Fetching all guild members to ensure a complete list...');
            await wtmGuild.members.fetch();
            logger.success('Successfully fetched all members.');

            const newData = new Map();
            const roleOutputForSheet = [];

            for (const roleName of roleListArray) {
                const role = wtmGuild.roles.cache.find(r => r.name.toLowerCase() === roleName);
                if (role) {
                    const members = role.members;
                    const memberIds = members.map(m => m.id);
                    const memberNames = members.map(m => m.displayName);

                    roleOutputForSheet.push(memberIds, memberNames);
                    newData.set(roleName, new Set(memberNames));
                } else {
                    logger.warn(`Could not find the role "${roleName}" in the server.`);
                    roleOutputForSheet.push([], []);
                    newData.set(roleName, new Set());
                }
            }
            logger.success('Successfully fetched and processed fresh role data.');

            // --- 4. Update the Google Sheet ---
            logger.info(`Clearing and writing new data to ${sheetName}...`);
            await sheets.spreadsheets.values.clear({ spreadsheetId, range });
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    majorDimension: 'COLUMNS',
                    values: roleOutputForSheet,
                },
            });
            logger.success('Google Sheet has been updated.');
            await interaction.editReply('✅ Successfully updated the Commander Core List Google Sheet. Generating report...');

            // --- 5. Compare Data and Generate Report ---
            const reportEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('Commander List Update Report')
                .setTimestamp();

            let hasChanges = false;
            for (const roleName of roleListArray) {
                const oldMembers = oldData.get(roleName);
                const newMembers = newData.get(roleName);

                const added = [...newMembers].filter(member => !oldMembers.has(member));
                const removed = [...oldMembers].filter(member => !newMembers.has(member));

                if (added.length > 0 || removed.length > 0) {
                    hasChanges = true;
                    let value = '';
                    if (added.length > 0) {
                        value += `**Added:**\n- ${added.join('\n- ')}\n\n`;
                    }
                    if (removed.length > 0) {
                        value += `**Removed:**\n- ${removed.join('\n- ')}`;
                    }

                    reportEmbed.addFields({
                        name: roleName.replace(/\b\w/g, l => l.toUpperCase()),
                        value: value.trim().substring(0, 1024),
                        inline: false
                    });
                }
            }

            if (!hasChanges) {
                reportEmbed.setDescription('No changes detected in any of the monitored roles. The sheet is up to date.');
            } else {
                reportEmbed.setDescription('The following changes were detected and synced to the sheet:');
            }

            // --- 6. Send Report as a Follow-up ---
            await interaction.followUp({ embeds: [reportEmbed], flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            logger.error('An error occurred during the /commanderlist command:', error);
            // Check if we can still reply or if we need to follow up
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ An error occurred while updating the sheet. Please check the bot logs.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: '❌ An error occurred while updating the sheet. Please check the bot logs.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};

