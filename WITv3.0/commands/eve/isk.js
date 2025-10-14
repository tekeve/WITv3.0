const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['public'],
    data: new SlashCommandBuilder()
        .setName('isk')
        .setDescription('Generates a unique link to the ISK/hour tracking form.'),

    async execute(interaction) {
        // This command now directly handles the tracker functionality.
        await handleTracker(interaction);
    },
};

async function handleTracker(interaction) {
    // Generate a unique token for the web form URL
    const token = uuidv4();

    // Initialize the token map if it doesn't exist
    if (!interaction.client.activeIskTokens) {
        interaction.client.activeIskTokens = new Map();
    }

    // Set an expiration time for the token (e.g., 60 minutes)
    const EXPIRATION_MINUTES = 60;
    const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

    // Store the token with user and interaction context
    interaction.client.activeIskTokens.set(token, {
        interaction,
        user: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        expires: expiryTimestamp
    });

    // Set a timeout to automatically remove the token when it expires
    setTimeout(() => {
        if (interaction.client.activeIskTokens.has(token)) {
            logger.warn(`ISK Tracker Token ${token} for ${interaction.user.tag} has expired.`);
            interaction.client.activeIskTokens.delete(token);
        }
    }, EXPIRATION_MINUTES * 60 * 1000);

    // Construct the URL for the web form
    const formUrl = `http://${process.env.HOST_NAME}/isk/${token}`;

    // Reply to the user with a link to the form
    await interaction.reply({
        content: `Click the button below to open the **ISK/Hour Tracker**. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
        components: [{
            type: 1,
            components: [{
                type: 2,
                label: `Open ISK Tracker`,
                style: 5,
                url: formUrl
            }]
        }],
        flags: [MessageFlags.Ephemeral] // Only the user who ran the command can see this
    });
}

