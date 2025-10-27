const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager'); // Used for permission checks

// Define permissions required to use this command
const REQUIRED_PERMISSIONS = ['council', 'admin'];

module.exports = {
    permissions: REQUIRED_PERMISSIONS, // Set permissions for the command itself
    data: new SlashCommandBuilder()
        .setName('walletmonitor')
        .setDescription('Generates a link to the corporation wallet monitor interface.'),

    async execute(interaction) {
        // Double-check permissions here just in case the handler logic changes
        if (!roleManager.hasPermission(interaction.member, REQUIRED_PERMISSIONS)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Generate a unique token for the web form URL
        const token = uuidv4();

        // Ensure the token map exists on the client object
        if (!interaction.client.activeWalletTokens) {
            interaction.client.activeWalletTokens = new Map();
        }

        // Set an expiration time for the token (e.g., 60 minutes)
        const EXPIRATION_MINUTES = 60;
        const expiryTimestamp = Date.now() + (EXPIRATION_MINUTES * 60 * 1000);

        // Store the token with user, guild ID, and expiry info
        // Storing member directly can cause issues if member object changes; fetch it in middleware instead.
        interaction.client.activeWalletTokens.set(token, {
            user: interaction.user, // Store user object for display/logging
            guildId: interaction.guild.id, // Store guild ID to fetch member later
            expires: expiryTimestamp
        });

        // Set a timeout to automatically remove the token when it expires
        setTimeout(() => {
            if (interaction.client.activeWalletTokens.has(token)) {
                logger.warn(`Wallet Monitor Token ${token} for ${interaction.user.tag} has expired.`);
                interaction.client.activeWalletTokens.delete(token);
            }
        }, EXPIRATION_MINUTES * 60 * 1000); // Convert minutes to milliseconds

        // Construct the URL for the web form
        const monitorUrl = `http://${process.env.HOST_NAME || 'localhost:3000'}/wallet/${token}`;

        // Reply to the user with a link to the form
        await interaction.reply({
            content: `Click the button below to open the **Corporation Wallet Monitor**. This link is for you only and will expire in **${EXPIRATION_MINUTES} minutes**.`,
            components: [{
                type: 1, // Action Row
                components: [{
                    type: 2, // Button
                    label: `Open Wallet Monitor`,
                    style: 5, // Link Style
                    url: monitorUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral] // Only the user who ran the command can see this
        });
    },
};
