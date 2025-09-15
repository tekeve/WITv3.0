const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const authManager = require('@helpers/authManager.js');
const roleManager = require('@helpers/roleManager');
const logger = require('@helpers/logger');
const configManager = require('@helpers/configManager');

module.exports = {
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
        if (!roleManager.canAuth(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const config = configManager.get(); // Get fresh config for every execution

        if (subcommand === 'login') {
            const ESI_CLIENT_ID = config.esiClientId;
            const ESI_CALLBACK_URL = config.esiCallbackUrl;
            const ESI_SCOPES = config.esiScopes;

            if (!ESI_CLIENT_ID || !ESI_CALLBACK_URL || !ESI_SCOPES) {
                logger.warn('ESI configuration is missing from the database. A user tried to run /auth login.');
                return interaction.reply({
                    content: 'The bot has not been configured for ESI authentication. Please contact the bot administrator.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const state = crypto.randomBytes(16).toString('hex');
            interaction.client.esiStateMap.set(state, interaction.user.id);

            const encodedScopes = ESI_SCOPES.split(' ').map(scope => encodeURIComponent(scope)).join('%20');
            const authUrl = `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(ESI_CALLBACK_URL)}&client_id=${ESI_CLIENT_ID}&scope=${encodedScopes}&state=${state}`;

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Login to EVE Online')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                );

            await interaction.reply({
                content: 'Click the button below to authorize your character. This will only grant the bot permissions to send mail on your behalf and view your mailing lists.',
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });
        }
        else if (subcommand === 'status') {
            const authData = await authManager.getUserAuthData(interaction.user.id);
            if (authData && authData.character_name) {
                // The expiry is now a Unix timestamp in milliseconds.
                const expiryTimestamp = Math.floor(authData.token_expiry / 1000);
                const embed = new EmbedBuilder()
                    .setColor(0x3BA55D)
                    .setTitle('Authentication Status: Connected')
                    .addFields(
                        { name: 'Authenticated Character', value: authData.character_name, inline: true },
                        { name: 'Token Expires', value: `<t:${expiryTimestamp}:R>`, inline: true }
                    )
                    .setFooter({ text: 'Your token will be refreshed automatically.' });
                await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
        else if (subcommand === 'logout') {
            const success = await authManager.removeUser(interaction.user.id);
            if (success) {
                await interaction.reply({ content: 'Your authentication token and character data have been successfully removed.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};

