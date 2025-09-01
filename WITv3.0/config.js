// You can get these IDs from the URL of your Google Sheet and Doc
// Example URL: https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
// Use simple, lowercase names as the keys (e.g., 'roster', 'rules').
module.exports = {

    // Channel IDs for the request system
    requestChannelId: '1411962383978725436',
    archiveChannelId: '1411962451439652904',

    // Add the exact, case-sensitive names of roles that can use the /incursion command.
    incursionRoles: [
        'Moderator',
        'Leadership',
        'Officer'
    ],
    // Add your role aliases here. The key is the alias, the value is the full role name.
    // Make sure the alias (the key) is lowercase.
    roleAliases: {
        'lead': 'Leadership',
        'officer': 'Officer',
        'it': 'IT',
        'ct': 'Certified Trainer',
        'tct': 'Training CT',
        'fc': 'Fleet Commander',
        'tfc': 'Training FC',
        'lc': 'Line Commander',
        'res': 'Resident',
        'cc': 'Commander'
    },
    // The roles that can manage other users' characters, and solve/deny request tickets
    adminRoles: [
        'Moderator',
        'Leadership',
        'Officer'
    ],

    // Add your channel ID here
    incursionChannelId: '1364223029814759444',

    //Google Sheets/Docs Info
    googleSheets: {
        'todo': '1A-QWH2SYQlXH1uNl3KJS-NfvVTPWidAx0UlBtifdAH8',
        //'inventory': 'YOUR_SECOND_SHEET_ID_HERE',
        //'finances': 'ANOTHER_SHEET_ID_HERE',
    },
    googleDocs: {
        'test': '1bZxBnoDmcD0EpaPJx9-CjZbY0tTl98vGqkqKkyENyF8',
        //'guide': 'YOUR_SECOND_DOC_ID_HERE',
    }
};