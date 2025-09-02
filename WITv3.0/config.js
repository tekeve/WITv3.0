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

    // Configuration for the /promote command
    promotions: {
        roleSets: {
            'resident': {
                add: ['Commander', 'Resident'],
                // No roles are removed when becoming a resident
            },
            'line_commander': {
                add: ['Line Commander'],
                remove: ['Resident'] // Example: A Line Commander is no longer just a Resident
            },
            'training_fc': {
                add: ['Training FC']
            },
            'fleet_commander': {
                add: ['Fleet Commander'],
                remove: ['Training FC']
            },
            'training_ct': {
                add: ['Training CT']
            },
            'certified_trainer': {
                add: ['Certified Trainer'],
                remove: ['Training CT']
            },
            'officer': {
                add: ['Officer']
            },
            'leadership': {
                add: ['Leadership'],
                remove: ['Officer']
            },
        },
        // Define the channel and message for each promotion's DM
        notificationInfo: {
            'resident': {
                channelId: '1412388512149409792',
                message: 'Welcome! You have been promoted to Resident. Please review the resident-master-list channel for more information.'
            },
            'line_commander': {
                channelId: '1412575503746990232',
                message: 'Congratulations on your promotion to Line Commander! Please review the master-list channel for more information.'
            },
            'training_ct': {
                channelId: '1412575547099189278',
                message: 'Congratulations on your promotion to Training CT! Please review the ct-master-list channel for more information.'
            },
            'officer': {
                channelId: '1412575584076431400',
                message: 'Congratulations on your promotion to Officer! Please review the council-master-list channel for more information.'
            },
            'leadership': {
                channelId: '1412575584076431400',
                message: 'Congratulations on your promotion to Leadership!'
            },
        }
    }
    // NEW: Configuration for the /demote command
    demotions: {
        // A complete list of all roles managed by the promote/demote commands.
        // This is used by the '/demote rank:all' option.
        allManagedRoles: [
            'Resident',
            'Line Commander',
            'Training FC',
            'Fleet Commander',
            'Training CT',
            'Certified Trainer',
            'Officer',
            'Leadership'
        ],
        roleSets: {
            'resident': {
                remove: ['Commander','Resident'],
                // No roles are added back when demoting from Resident
            },
            'line_commander': {
                remove: ['Line Commander'],
                add: ['Resident']
            },
            'training_fc': {
                remove: ['Training FC'],
                add: ['Line Commander']
            },
            'fleet_commander': {
                remove: ['Fleet Commander']
            },
            'training_ct': {
                remove: ['Training CT']
            },
            'certified_trainer': {
                remove: ['Certified Trainer']
            },
            'officer': {
                remove: ['Officer'],
                add: ['Fleet Commander', 'Certified Trainer'] // Assumes
            },
            'leadership': {
                remove: ['Leadership'],
                add: ['Officer']
            },
        }
    }
};