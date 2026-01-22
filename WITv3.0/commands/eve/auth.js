const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const authManager = require('@helpers/authManager.js');
const logger = require('@helpers/logger');
const roleManager = require('@helpers/roleManager.js'); // Import roleManager
const esiService = require('@helpers/esiService.js'); // Import esiService for status check

module.exports = {
    // Keep permissions as they are, but users needing wallet access will need specific roles.
    permissions: ['assault_line_commander', 'training_fc', 'fleet_commander', 'training_ct', 'certified_trainer', 'council'],
    data: new SlashCommandBuilder()
        .setName('auth')
        .setDescription('Authenticate your EVE Online character with the bot.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('login')
                .setDescription('Generate a link to authorize your character.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check the status of your current authentication.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logout')
                .setDescription('De-authorize your character and remove your token.')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'login') {
            const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;
            const ESI_CALLBACK_URL = `https://${process.env.HOST_NAME}/callback`;
            const ESI_SCOPES = process.env.ESI_DEFAULT_SCOPES || '';

            if (!ESI_CLIENT_ID || !ESI_CALLBACK_URL) {
                logger.warn('ESI configuration is missing from the .env file. A user tried to run /auth login.');
                return interaction.reply({
                    content: 'The bot has not been configured for ESI authentication. Please contact the bot administrator.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // --- SCOPE UPDATE START ---
            // Define base scopes required for all users
            const baseScopes = [
                'esi-mail.send_mail.v1',
                'esi-mail.read_mail.v1',
                'esi-search.search_structures.v1',
            ];

            // Check if the user is Leadership or higher
            const isLeadership = roleManager.isLeadershipOrHigher(interaction.member);

            // Add wallet scope ONLY if the user is Leadership or higher
            if (isLeadership) {
                baseScopes.push('esi-wallet.read_corporation_wallets.v1');
            }

            // Combine configured scopes with required scopes, ensuring uniqueness
            const configuredScopes = ESI_SCOPES.split(' ').filter(Boolean); // Filter out empty strings
            const finalScopesSet = new Set([...configuredScopes, ...baseScopes]);
            const finalScopesString = Array.from(finalScopesSet).join(' ');
            // --- SCOPE UPDATE END ---


            const state = crypto.randomBytes(16).toString('hex');
            interaction.client.esiStateMap.set(state, interaction.user.id);

            // Encode the final combined scopes string
            const encodedScopes = finalScopesString.split(' ').map(scope => encodeURIComponent(scope)).join('%20');
            const authUrl = `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(ESI_CALLBACK_URL)}&client_id=${ESI_CLIENT_ID}&scope=${encodedScopes}&state=${state}`;

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Login to EVE Online')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                );

            // Dynamically change the message based on whether wallet scopes are being requested
            const content = isLeadership
                ? 'Click the button below to authorize. **As Leadership, this will request corporation wallet read permissions** in addition to mail and search scopes.'
                : 'Click the button below to authorize your character. This grants permissions for mail and search. **Wallet permissions are not requested for your account.**';

            await interaction.reply({
                content: content,
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });
        }
        else if (subcommand === 'status') {
            const authData = await authManager.getUserAuthData(interaction.user.id);
            if (authData && authData.character_name) {
                const expiryTimestamp = Math.floor(authData.token_expiry / 1000);

                const refreshTokenStatus = authData.refresh_token
                    ? 'Active (Automatically refreshed on use)'
                    : 'Inactive (Please re-authenticate)';

                // Fetch scopes associated with the current token for display (optional but helpful)
                let currentScopes = 'Could not verify scopes.'; // Default message
                if (authData.access_token) {
                    try {
                        const verifyResponse = await esiService.get({
                            endpoint: 'https://login.eveonline.com/oauth/verify',
                            headers: { 'Authorization': `Bearer ${authData.access_token}` },
                            caller: __filename // Pass caller info
                        });
                        // Check if verifyResponse and its data exist before accessing Scopes
                        if (verifyResponse && verifyResponse.data && verifyResponse.data.Scopes) {
                            currentScopes = verifyResponse.data.Scopes;
                        } else {
                            logger.warn(`ESI verify endpoint did not return expected Scopes for ${authData.character_name}`);
                            // Keep the default message "Could not verify scopes."
                        }
                    } catch (verifyError) {
                        logger.error(`Error verifying ESI token scopes for ${authData.character_name}: ${verifyError.message}`);
                        // Keep the default message "Could not verify scopes."
                        if (verifyError.response && verifyError.response.status === 401) {
                            currentScopes = 'Token likely expired or invalid. Please re-authenticate.';
                        }
                    }
                }


                const embed = new EmbedBuilder()
                    .setColor(0x3BA55D)
                    .setTitle('Authentication Status: Connected')
                    .addFields(
                        { name: 'Authenticated Character', value: authData.character_name, inline: true },
                        { name: 'Access Token Expires', value: `<t:${expiryTimestamp}:R>`, inline: true },
                        { name: 'Refresh Token Status', value: refreshTokenStatus, inline: false },
                        { name: 'Granted Scopes', value: `\`\`\`${currentScopes}\`\`\`` }, // Display scopes
                        { name: 'Manage Access', value: '[Revoke on EVE Online\'s Website](https://community.eveonline.com/support/third-party-applications/)' }
                    )
                    .setFooter({ text: 'Note: If unused for an extended period, you may need to re-authenticate.' });
                await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
        else if (subcommand === 'logout') {
            const success = await authManager.removeAuth(interaction.user.id);
            if (success) {
                await interaction.reply({ content: 'Your authentication token and character data have been successfully removed.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};

