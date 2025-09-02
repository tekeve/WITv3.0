const { google } = require('googleapis');

async function getAuth() {
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
    const serviceAccountCredentials = JSON.parse(credentials);
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: serviceAccountCredentials.client_email,
            private_key: serviceAccountCredentials.private_key.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/documents'],
    });
    const client = await auth.getClient();
    return client;
}

async function getSheetsService() {
    const auth = await getAuth();
    return google.sheets({ version: 'v4', auth });
}

async function getDocsService() {
    const auth = await getAuth();
    return google.docs({ version: 'v1', auth });
}

module.exports = { getSheetsService, getDocsService };