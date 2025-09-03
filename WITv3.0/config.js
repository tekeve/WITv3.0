module.exports = {
    // Add the system IDs for the major trade hubs.
    tradeHubs: {
        'Jita': 30000617,
        'Amarr': 30002187,
        'Dodixie': 30002659,
        'Hek': 30002053,
        'Rens': 30002510,
    },

    // Add the exact, case-sensitive names of roles that can use the /incursion command.
    incursionRoles: [
        'Moderator',
        'Leadership',
        'Officer',
        'Big Cheese',
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
        'Officer',
        'Big Cheese',
    ],
    // Add the roles that can use the /auth command
    authRoles: [
        'Moderator',
        'Big Cheese',
    ],

    // You can get these IDs from the URL of your Google Sheet and Doc
    // Example URL: https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
    // Use simple, lowercase names as the keys (e.g., 'roster', 'rules').

    //Google Sheets/Docs Info
    googleSheets: {
        'todo': '1A-QWH2SYQlXH1uNl3KJS-NfvVTPWidAx0UlBtifdAH8',
        'fleet': '1sTF1NxruAiUKOr52wKu33ka14mx3_xCH',
        //'inventory': 'YOUR_SECOND_SHEET_ID_HERE',
        //'finances': 'ANOTHER_SHEET_ID_HERE',
    },
    googleDocs: {
        'test': '1bZxBnoDmcD0EpaPJx9-CjZbY0tTl98vGqkqKkyENyF8',
        //'guide': 'YOUR_SECOND_DOC_ID_HERE',
    },
    // ESI Application details for OAuth
    // You MUST create an application at https://developers.eveonline.com/
    esi: {
        // These should be in your .env file
        clientId: process.env.ESI_CLIENT_ID,
        secretKey: process.env.ESI_SECRET_KEY,
        // This MUST match the Callback URL in your ESI Application.
        // The port should be one that is open on your server/computer.
        callbackUrl: process.env.ESI_CALLBACK_URL,
        // The scopes your bot needs. 'esi-mail.send_mail.v1' is required for sending mail. 'esi-mail.read_mail.v1' is required to identify mailing list ID's
        scopes: process.env.ESI_DEFAULT_SCOPES

    },
    // Add the SRP mailing list ID for in-game mail notifications.
    srpMailingListId: '145241588',

    // New Role Hierarchy for Promotions and Demotions
    roleHierarchy: {
        'Commander': {
            promote: {
                add: ['Commander'],
                remove: []
            },
            demote: {
                add: [],
                remove: ['Commander']
            }
        },
        'Resident': {
            promote: {
                add: ['Commander','Resident'],
                remove: []
            },
            demote: {
                add: [],
                remove: ['Commander','Resident']
            }
        },
        'Line Commander': {
            promote: {
                add: ['Line Commander'],
                remove: ['Resident']
            },
            demote: {
                add: ['Resident'],
                remove: ['Line Commander']
            }
        },
        'Training FC': {
            promote: {
                add: ['Training FC'],
                remove: []
            },
            demote: {
                add: [],
                remove: ['Training FC']
            }
        },
        'Fleet Commander': {
            promote: {
                add: ['Fleet Commander'],
                remove: ['Training FC']
            },
            demote: {
                add: ['Line Commander'],
                remove: ['Fleet Commander']
            }
        },
        'Training CT': {
            promote: {
                add: ['Training CT'],
                remove: []
            },
            demote: {
                add: [],
                remove: ['Training CT']
            }
        },
        'Certified Trainer': {
            promote: {
                add: ['Certified Trainer'],
                remove: ['Training CT']
            },
            demote: {
                add: [],
                remove: ['Certified Trainer']
            }
        },
        'Officer': {
            promote: {
                add: ['Officer'],
                remove: []
            },
            demote: {
                add: [],
                remove: ['Officer']
            }
        },
        'Leadership': {
            promote: {
                add: ['Leadership'],
                remove: ['Officer']
            },
            demote: {
                add: [],
                remove: ['Leadership']
            }
        },
    },
};