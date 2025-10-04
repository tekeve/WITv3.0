const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getSheetsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

module.exports = {
    // Setting permission to 'admin' to protect this administrative command.
    permission: 'admin',

    // Define the slash command's name and description.
    data: new SlashCommandBuilder()
        .setName('commanderlist')
        .setDescription('Updates the Google Sheet with the current list of commanders.'),

    /**
     * This is the main function that runs when the command is used.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        // Defer the reply to give the bot time to fetch data and interact with Google Sheets.
        // The 'ephemeral' flag means only the user who ran the command will see the response.
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // --- 1. Fetch Data from Discord ---
            logger.info('Fetching commander roles from Discord...');

            // The specific Discord server ID from your original file.
            const wtmGuild = interaction.client.guilds.cache.get('295568584409743361');
            if (!wtmGuild) {
                return interaction.editReply('Error: Could not find the target Discord server.');
            }

            // Force fetch all members to ensure the cache is complete before accessing role members.
            // This is necessary on large servers where not all members are cached by default.
            logger.info('Fetching all guild members to ensure a complete list...');
            await wtmGuild.members.fetch();
            logger.success('Successfully fetched all members.');

            const roleListArray = ["fleet commander", "training fc", "line commander", "resident", "commander"];
            const roleOutput = [];

            for (const roleName of roleListArray) {
                const role = wtmGuild.roles.cache.find(r => r.name.toLowerCase() === roleName);
                if (role) {
                    // Fetch members for the role
                    const members = role.members;
                    const outID = members.map(m => m.id);
                    const output = members.map(m => m.displayName);
                    roleOutput.push(outID, output);
                } else {
                    logger.warn(`Could not find the role "${roleName}" in the server.`);
                    // Push empty arrays as placeholders to keep the column structure consistent
                    roleOutput.push([], []);
                }
            }
            logger.success('Successfully fetched role data from Discord.');

            // --- 2. Authenticate and Prepare Google Sheets API ---
            logger.info('Connecting to Google Sheets API...');
            const sheets = await getSheetsService();
            const config = configManager.get();
            const spreadsheetId = config.googleSheets['CommandCoreList'];

            if (!spreadsheetId) {
                logger.error('Spreadsheet ID for alias "CommandCoreList" not found in config.');
                return interaction.editReply('Error: The spreadsheet alias "CommandCoreList" is not configured correctly.');
            }

            const sheetName = 'DiscordPull'; // The name of the tab in your spreadsheet

            // --- 3. Clear Existing Data in the Sheet ---
            logger.info(`Clearing range ${sheetName}!A2:J in spreadsheet ${spreadsheetId}...`);
            await sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `${sheetName}!A2:J`,
            });
            logger.success('Successfully cleared the target range.');

            // --- 4. Write New Data to the Sheet ---
            logger.info(`Writing new data to ${sheetName}!A2...`);
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    majorDimension: 'COLUMNS',
                    values: roleOutput,
                },
            });
            logger.success('Successfully wrote new data to the spreadsheet.');

            // --- 5. Send Final Confirmation ---
            await interaction.editReply('✅ Successfully updated the Commander Core List Google Sheet.');

        } catch (error) {
            logger.error('An error occurred during the /commanderlist command:', error);
            await interaction.editReply('❌ An error occurred while updating the sheet. Please check the bot logs for more details.');
        }
    },
};

