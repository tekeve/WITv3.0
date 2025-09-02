const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const authManager = require('@helpers/authManager.js');
const { esi, authRoles } = require('../../config.js');
const logger = require('@helpers/logger');
require('dotenv').config();

// Load the ESI Client ID from environment variables
const ESI_CLIENT_ID = process.env.ESI_CLIENT_ID;

// Helper function to check for required roles
const hasAuthRole = (member) => member.roles.cache.some(role => authRoles.includes(role.name));

// Check to ensure the ESI Client ID is configured.
if (!ESI_CLIENT_ID) {
    logger.error("FATAL: ESI_CLIENT_ID is not defined in the .env file. The /auth command will not work.");
}

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
        // Check if the user has permission to use this command
        if (!hasAuthRole(interaction.member)) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'login') {
            // If the Client ID is missing, inform the user and stop.
            if (!ESI_CLIENT_ID) {
                return interaction.reply({
                    content: 'The bot has not been configured for ESI authentication. Please contact the bot administrator.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const state = crypto.randomBytes(16).toString('hex');
            interaction.client.esiStateMap.set(state, interaction.user.id);

            // Correctly format the scopes for the URL
            const encodedScopes = esi.scopes.split(' ').map(scope => encodeURIComponent(scope)).join('%20');

            const authUrl = `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(esi.callbackUrl)}&client_id=${ESI_CLIENT_ID}&scope=${encodedScopes}&state=${state}`;

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Login to EVE Online')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                );

            await interaction.reply({
                content: 'Click the button below to authorize your character. You will be redirected to the official EVE Online SSO page.',
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });
        }
        else if (subcommand === 'status') {
            const authData = await authManager.getUserAuthData(interaction.user.id);
            if (authData) {
                const expiryDate = new Date(authData.token_expiry);
                const embed = new EmbedBuilder()
                    .setColor(0x3BA55D)
                    .setTitle('Authentication Status: Connected')
                    .addFields(
                        { name: 'Authenticated Character', value: authData.character_name, inline: true },
                        { name: 'Token Expires', value: `<t:${Math.floor(expiryDate.getTime() / 1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: 'Your token will be refreshed automatically.' });
                await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
        else if (subcommand === 'logout') {
            const success = authManager.removeUser(interaction.user.id);
            if (success) {
                await interaction.reply({ content: 'Your authentication token and character data have been successfully removed.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'You do not have a character authenticated with this bot.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};
