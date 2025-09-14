const { SlashCommandBuilder } = require('discord.js');
const { getSheetsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');
const databaseManager = require('@helpers/databaseManager'); // Import the new manager

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sheet')
        .setDescription('Interact with Google Sheets (Admin Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read data from a cell in a specific sheet')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the sheet to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true) // Enable autocomplete
                )
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to read (e.g., A1)').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('write')
                .setDescription('Write data to a cell in a specific sheet')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the sheet to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true) // Enable autocomplete
                )
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to write to (e.g., B2)').setRequired(true))
                .addStringOption(option =>
                    option.setName('value').setDescription('The value to write').setRequired(true))
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        // Use our database manager to get suggestions from the 'google_sheets' table
        const choices = await databaseManager.getKeys('google_sheets', focusedValue);
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction) {
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this command.' });
        }

        await interaction.deferReply();

        try {
            const sheets = await getSheetsService();
            const subcommand = interaction.options.getSubcommand();
            const cell = interaction.options.getString('cell');
            const sheetName = interaction.options.getString('name');

            // Get the full, up-to-date config inside the command
            const config = configManager.get();
            const spreadsheetId = config.googleSheets[sheetName];

            if (!spreadsheetId) {
                return interaction.editReply(`Could not find a sheet with the name "${sheetName}". Please select one from the list.`);
            }

            if (subcommand === 'read') {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `Sheet1!${cell}`,
                });
                const value = response.data.values ? response.data.values[0][0] : 'empty';
                await interaction.editReply(`Value in **${sheetName}** cell ${cell} is: **${value}**`);

            } else if (subcommand === 'write') {
                const value = interaction.options.getString('value');
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `Sheet1!${cell}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[value]] },
                });
                await interaction.editReply(`Successfully wrote **${value}** to **${sheetName}** cell ${cell}.`);
            }
        } catch (error) {
            logger.error('Error with Google Sheets API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Sheets.');
        }
    },
};
