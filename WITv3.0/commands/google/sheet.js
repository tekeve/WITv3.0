const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSheetsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');
const tableManager = require('@helpers/managers/tableManager');

module.exports = {
    permissions: ['leadership', 'admin'],
    data: new SlashCommandBuilder()
        .setName('sheet')
        .setDescription('Interact with Google Sheets (Leadership Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read data from a cell, row, or column in a specific sheet.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The alias of the sheet to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('range')
                        .setDescription('The cell (A1), row (5), or column (B) to read.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('sheet')
                        .setDescription('The specific sheet/tab name within the spreadsheet (defaults to Sheet1)'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('write')
                .setDescription('Write data to a cell in a specific sheet')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The alias of the sheet to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to write to (e.g., B2)').setRequired(true))
                .addStringOption(option =>
                    option.setName('value').setDescription('The value to write').setRequired(true))
                .addStringOption(option =>
                    option.setName('sheet')
                        .setDescription('The specific sheet/tab name within the spreadsheet (defaults to Sheet1)'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('listtabs')
                .setDescription('Lists all the sheet/tab names within a spreadsheet.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The alias of the spreadsheet to inspect.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        // Use our database manager to get suggestions from the 'google_sheets' table
        const choices = await tableManager.getKeys('google_sheets', focusedValue);
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const sheets = await getSheetsService();
            const subcommand = interaction.options.getSubcommand();
            const sheetAlias = interaction.options.getString('name'); // Used by all subcommands

            // Get the full, up-to-date config inside the command
            const config = configManager.get();
            const spreadsheetId = config.googleSheets[sheetAlias];

            if (!spreadsheetId) {
                return interaction.editReply(`Could not find a sheet with the alias "${sheetAlias}". Please select one from the list.`);
            }

            if (subcommand === 'read' || subcommand === 'write') {
                const userInput = interaction.options.getString(subcommand === 'read' ? 'range' : 'cell');
                const tabName = interaction.options.getString('sheet') || 'Sheet1';

                let apiRange;
                // Check if user input is just a number (a row)
                if (/^\d+$/.test(userInput)) {
                    apiRange = `'${tabName}'!${userInput}:${userInput}`;
                    // Check if user input is just letters (a column)
                } else if (/^[A-Z]+$/i.test(userInput)) {
                    apiRange = `'${tabName}'!${userInput}:${userInput}`;
                    // Otherwise, treat it as a cell or complex range
                } else {
                    apiRange = `'${tabName}'!${userInput}`;
                }


                if (subcommand === 'read') {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: apiRange,
                    });

                    const values = response.data.values;

                    if (!values || values.length === 0) {
                        return interaction.editReply(`The range **${userInput}** in **${sheetAlias} -> ${tabName}** is empty.`);
                    }

                    // Handle single cell response
                    if (values.length === 1 && values[0].length === 1) {
                        await interaction.editReply(`Value in **${sheetAlias} -> ${tabName}** cell ${userInput} is: **${values[0][0]}**`);
                        return;
                    }

                    // Handle row or column response
                    const flatValues = values.flat(); // Flatten the 2D array into a simple array
                    const embed = new EmbedBuilder()
                        .setColor(0x34A853)
                        .setTitle(`Data from: ${sheetAlias}`)
                        .setDescription(`Displaying data for range \`${tabName}!${userInput}\``)
                        .addFields({ name: 'Values', value: '```\n' + flatValues.join('\n') + '\n```' });

                    await interaction.editReply({ embeds: [embed] });

                } else { // 'write'
                    const value = interaction.options.getString('value');
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: apiRange, // Use the constructed range
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[value]] },
                    });
                    await interaction.editReply(`Successfully wrote **${value}** to **${sheetAlias} -> ${tabName}** cell ${userInput}.`);
                }
            } else if (subcommand === 'listtabs') {
                const response = await sheets.spreadsheets.get({
                    spreadsheetId,
                });

                const sheetNames = response.data.sheets.map(sheet => sheet.properties.title);

                if (sheetNames.length === 0) {
                    return interaction.editReply(`The spreadsheet **${sheetAlias}** has no sheets.`);
                }

                const embed = new EmbedBuilder()
                    .setColor(0x34A853) // Google Sheets Green
                    .setTitle(`Tabs in Spreadsheet: "${sheetAlias}"`)
                    .setDescription('```\n' + sheetNames.join('\n') + '\n```')
                    .setFooter({ text: 'Use these names in the optional "sheet" argument for read/write commands.' });

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Error with Google Sheets API:', error.message);
            if (error.message && error.message.includes('Unable to parse range')) {
                await interaction.editReply(`Error: Google Sheets could not find the specified sheet/tab or cell. Please double-check that the sheet name is correct and the cell exists.`);
            } else {
                await interaction.editReply('An unexpected error occurred while connecting to Google Sheets.');
            }
        }
    },
};
