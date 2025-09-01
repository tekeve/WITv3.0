const { SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');
const { googleSheetId } = require('../../config.js');

// Helper function for Google Auth
async function getAuth() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sheet')
        .setDescription('Interact with Google Sheets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read data from a cell')
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to read (e.g., A1)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('write')
                .setDescription('Write data to a cell')
                .addStringOption(option =>
                    option.setName('cell').setDescription('The cell to write to (e.g., B2)').setRequired(true))
                .addStringOption(option =>
                    option.setName('value').setDescription('The value to write').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Acknowledge command, reply will be private

        try {
            const sheets = await getAuth();
            const subcommand = interaction.options.getSubcommand();
            const cell = interaction.options.getString('cell');

            if (subcommand === 'read') {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: googleSheetId,
                    range: `Sheet1!${cell}`, // Assumes you're working on 'Sheet1'
                });

                const value = response.data.values ? response.data.values[0][0] : 'empty';
                await interaction.editReply(`Value in cell ${cell} is: **${value}**`);
            }
            else if (subcommand === 'write') {
                const value = interaction.options.getString('value');
                await sheets.spreadsheets.values.update({
                    spreadsheetId: googleSheetId,
                    range: `Sheet1!${cell}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[value]],
                    },
                });

                await interaction.editReply(`Successfully wrote **${value}** to cell ${cell}.`);
            }
        } catch (error) {
            console.error('Error with Google Sheets API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Sheets.');
        }
    },
};