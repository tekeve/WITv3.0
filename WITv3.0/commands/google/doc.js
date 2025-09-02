const { SlashCommandBuilder, MessageFlags } = require('discord.js');
// Import the new centralized function instead of the googleapis library
const { getDocsService } = require('../../helpers/googleAuth.js');
// Import the entire docs object from our config
const { googleDocs } = require('../../config.js');

// The local getAuth() helper function is no longer needed here.

// Helper function to extract text from a Google Doc response
function readDocContent(doc) {
    let text = '';
    if (doc.body && doc.body.content) {
        doc.body.content.forEach(element => {
            if (element.paragraph) {
                element.paragraph.elements.forEach(elem => {
                    if (elem.textRun) {
                        text += elem.textRun.content;
                    }
                });
            }
        });
    }
    return text.trim() ? text : 'The document is empty.';
}

// Dynamically create the choices for the command option
const docChoices = Object.keys(googleDocs).map(key => ({ name: key, value: key }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('doc')
        .setDescription('Interact with Google Docs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read the content of a specific document')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the document to access')
                        .setRequired(true)
                        .addChoices(...docChoices)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('append')
                .setDescription('Append text to the end of a specific document')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the document to access')
                        .setRequired(true)
                        .addChoices(...docChoices))
                .addStringOption(option =>
                    option.setName('text').setDescription('The text to append').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // Call the new centralized function to get the authenticated docs service
            const docs = await getDocsService();
            const subcommand = interaction.options.getSubcommand();

            // Get the chosen doc name and look up its ID
            const docName = interaction.options.getString('name');
            const documentId = googleDocs[docName];

            if (!documentId) {
                await interaction.editReply('Could not find a document with that name in the configuration.');
                return;
            }

            if (subcommand === 'read') {
                const response = await docs.documents.get({
                    documentId: documentId, // Use the dynamic ID
                });
                const content = readDocContent(response.data);
                await interaction.editReply(`**Content of ${docName}:**\n\n${content.substring(0, 1900)}`);

            } else if (subcommand === 'append') {
                const textToAppend = interaction.options.getString('text');

                // To append, we need to find the end index of the document body
                const docData = await docs.documents.get({ documentId: documentId, fields: 'body(content(endIndex))' });
                const endIndex = docData.data.body.content[docData.data.body.content.length - 1].endIndex - 1;

                await docs.documents.batchUpdate({
                    documentId: documentId, // Use the dynamic ID
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
            console.error('Error with Google Docs API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Docs.');
        }
    },
};