const { SlashCommandBuilder } = require('discord.js');
const { google } = require('googleapis');
const { googleDocId } = require('../../config.js');

// Helper function for Google Auth
async function getAuth() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/documents',
    });
    const client = await auth.getClient();
    return google.docs({ version: 'v1', auth: client });
}

// Helper to get text from Google Docs response
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('doc')
        .setDescription('Interact with Google Docs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('read')
                .setDescription('Read the content of the document'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('append')
                .setDescription('Append text to the end of the document')
                .addStringOption(option =>
                    option.setName('text').setDescription('The text to append').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const docs = await getAuth();
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'read') {
                const response = await docs.documents.get({
                    documentId: googleDocId,
                });
                const content = readDocContent(response.data);
                // Discord has a 2000 character limit for replies
                await interaction.editReply(`**Document Content:**\n\n${content.substring(0, 1900)}`);

            } else if (subcommand === 'append') {
                const textToAppend = interaction.options.getString('text');

                // First, get the document to find the end index
                const docData = await docs.documents.get({
                    documentId: googleDocId,
                    fields: 'body(content(endIndex))',
                });

                // The end index of the body content segment.
                const endIndex = docData.data.body.content[docData.data.body.content.length - 1].endIndex - 1;

                await docs.documents.batchUpdate({
                    documentId: googleDocId,
                    requestBody: {
                        requests: [
                            {
                                insertText: {
                                    location: {
                                        index: endIndex,
                                    },
                                    text: `\n${textToAppend}`, // Add a newline before the text
                                },
                            },
                        ],
                    },
                });

                await interaction.editReply(`Successfully appended text to the document.`);
            }
        } catch (error) {
            console.error('Error with Google Docs API:', error);
            await interaction.editReply('Something went wrong while connecting to Google Docs.');
        }
    },
};