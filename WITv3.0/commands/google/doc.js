const { SlashCommandBuilder } = require('discord.js');
const { getDocsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');
const tableManager = require('@helpers/managers/tableManager');

module.exports = {
    permission: 'leadership',
    data: new SlashCommandBuilder()
        .setName('doc')
        .setDescription('Interact with Google Docs (Leadership Only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read the content of a specific document')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the document to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true) // Enable autocomplete
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('append')
                .setDescription('Append text to the end of a specific document')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the document to access (start typing to see options)')
                        .setRequired(true)
                        .setAutocomplete(true) // Enable autocomplete
                )
                .addStringOption(option =>
                    option.setName('text').setDescription('The text to append').setRequired(true))
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        // Use our database manager to get suggestions from the 'google_docs' table
        const choices = await tableManager.getKeys('google_docs', focusedValue);
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const docs = await getDocsService();
            const subcommand = interaction.options.getSubcommand();
            const docName = interaction.options.getString('name');

            // Get the full, up-to-date config inside the command
            const config = configManager.get();
            const documentId = config.googleDocs[docName];

            if (!documentId) {
                return interaction.editReply(`Could not find a document with the name "${docName}". Please select one from the list.`);
            }

            if (subcommand === 'read') {
                const response = await docs.documents.get({ documentId });
                const content = (doc) => {
                    let text = '';
                    if (doc.body && doc.body.content) {
                        doc.body.content.forEach(element => {
                            if (element.paragraph) {
                                element.paragraph.elements.forEach(elem => {
                                    if (elem.textRun) text += elem.textRun.content;
                                });
                            }
                        });
                    }
                    return text.trim() ? text : 'The document is empty.';
                };
                await interaction.editReply(`**Content of ${docName}:**\n\n${content(response.data).substring(0, 1900)}`);

            } else if (subcommand === 'append') {
                const textToAppend = interaction.options.getString('text');
                const docData = await docs.documents.get({ documentId, fields: 'body(content(endIndex))' });
                const endIndex = docData.data.body.content[docData.data.body.content.length - 1].endIndex - 1;

                await docs.documents.batchUpdate({
                    documentId,
                    requestBody: {
                        requests: [{
                            insertText: {
                                location: { index: endIndex },
                                text: `\n${textToAppend}`,
                            },
                        }],
                    },
                });
                await interaction.editReply(`Successfully appended text to the **${docName}** document.`);
            }
        } catch (error) {
            logger.error('Error with Google Docs API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Docs.');
        }
    },
};
