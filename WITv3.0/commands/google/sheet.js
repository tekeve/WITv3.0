const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { google } = require('googleapis');
// Import the entire sheets object from our config
const { googleSheets } = require('../../config.js');

// Helper function for Google Auth (no changes here)
async function getAuth() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

// Dynamically create the choices for the command option
const sheetChoices = Object.keys(googleSheets).map(key => ({ name: key, value: key }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sheet')
        .setDescription('Interact with Google Sheets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read data from a cell in a specific sheet')
                .addStringOption(option => // Add the new choice option
                    option.setName('name')
                        .setDescription('The name of the sheet to access')
                        .setRequired(true)
                        .addChoices(...sheetChoices)) // <-- Spread the choices here
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to read (e.g., A1)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('write')
                .setDescription('Write data to a cell in a specific sheet')
                .addStringOption(option => // Add the new choice option here as well
                    option.setName('name')
                        .setDescription('The name of the sheet to access')
                        .setRequired(true)
                        .addChoices(...sheetChoices))
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to write to (e.g., B2)').setRequired(true))
                .addStringOption(option =>
                    option.setName('value').setDescription('The value to write').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const sheets = await getAuth();
            const subcommand = interaction.options.getSubcommand();
            const cell = interaction.options.getString('cell');

            // Get the chosen sheet name and look up its ID
            const sheetName = interaction.options.getString('name');
            const spreadsheetId = googleSheets[sheetName];

            if (!spreadsheetId) {
                await interaction.editReply('Could not find a sheet with that name in the configuration.');
                return;
            }

            if (subcommand === 'read') {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: spreadsheetId, // Use the dynamic ID
                    range: `Sheet1!${cell}`,
                });

                const value = response.data.values ? response.data.values[0][0] : 'empty';
                await interaction.editReply(`Value in **${sheetName}** cell ${cell} is: **${value}**`);
            }
            else if (subcommand === 'write') {
                const value = interaction.options.getString('value');
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId, // Use the dynamic ID
                    range: `Sheet1!${cell}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[value]],
                    },
                });

                await interaction.editReply(`Successfully wrote **${value}** to **${sheetName}** cell ${cell}.`);
            }
        } catch (error) {
            console.error('Error with Google Sheets API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Sheets.');
        }
    },
};