const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const authManager = require('@helpers/authManager.js');
const logger = require('@helpers/logger');

module.exports = {
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
            const ESI_CALLBACK_URL = `http://${process.env.HOST_NAME}/callback`;
            const ESI_SCOPES = process.env.ESI_DEFAULT_SCOPES || '';

            if (!ESI_CLIENT_ID || !ESI_CALLBACK_URL) {
                logger.warn('ESI configuration is missing from the .env file. A user tried to run /auth login.');
                return interaction.reply({
                    content: 'The bot has not been configured for ESI authentication. Please contact the bot administrator.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // --- FIX START ---
            // Ensure the required scope for authenticated search is always included.
            const requiredScope = 'esi-search.search_structures.v1';
            const scopes = new Set(ESI_SCOPES.split(' '));
            scopes.add(requiredScope);
            const finalScopes = Array.from(scopes).join(' ');
            // --- FIX END ---

            const state = crypto.randomBytes(16).toString('hex');
            interaction.client.esiStateMap.set(state, interaction.user.id);

            const encodedScopes = finalScopes.split(' ').map(scope => encodeURIComponent(scope)).join('%20');
            const authUrl = `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(ESI_CALLBACK_URL)}&client_id=${ESI_CLIENT_ID}&scope=${encodedScopes}&state=${state}`;

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Login to EVE Online')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                );

            await interaction.reply({
                content: 'Click the button below to authorize your character. This will only grant the bot permissions to send mail on your behalf and view your mailing lists. **Important:** You must authenticate with a character already registered to your profile.',
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

                const embed = new EmbedBuilder()
                    .setColor(0x3BA55D)
                    .setTitle('Authentication Status: Connected')
                    .addFields(
                        { name: 'Authenticated Character', value: authData.character_name, inline: true },
                        { name: 'Access Token Expires', value: `<t:${expiryTimestamp}:R>`, inline: true },
                        { name: 'Refresh Token Status', value: refreshTokenStatus, inline: false },
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

