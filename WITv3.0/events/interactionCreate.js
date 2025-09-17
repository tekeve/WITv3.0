const { Events, MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const requestManager = require('@helpers/requestManager');
const mailManager = require('@helpers/mailManager');
const webEditInteractionManager = require('@interactions/webeditInteraction');
const roleManager = require('@helpers/roleManager');
const auditLogger = require('@helpers/auditLogger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;

                // Log the command usage
                await auditLogger.logCommand(interaction);

                // Dynamic Permissions Check
                const permissionChecks = {
                    admin: roleManager.isAdmin,
                    council: roleManager.isCouncilOrAdmin,
                    commander: roleManager.isCommanderOrAdmin,
                    auth: roleManager.canAuth,
                    public: () => true,
                };

                const requiredPermission = command.permission || 'admin';
                const hasPermission = permissionChecks[requiredPermission];

                if (!hasPermission || !hasPermission(interaction.member)) {
                    return interaction.reply({
                        content: 'You do not have the required permission to use this command.',
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await command.execute(interaction);
            }
            else if (interaction.isAutocomplete()) {
                const command = client.commands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;
                await command.autocomplete(interaction);
            } else if (interaction.isStringSelectMenu()) {
                if (interaction.customId.startsWith('webedit_')) {
                    await webEditInteractionManager.handleInteraction(interaction);
                }
            }
            else if (interaction.isButton()) {
                const { customId } = interaction;
                if (customId.startsWith('ticket_')) {
                    await requestManager.handleInteraction(interaction);
                }
            }
            else if (interaction.isModalSubmit()) {
                const { customId } = interaction;
                if (customId.startsWith('resolve_modal_')) {
                    await requestManager.handleInteraction(interaction);
                } else if (customId.startsWith('sendmail_modal_')) {
                    await mailManager.handleModal(interaction);
                }
            }
        } catch (error) {
            logger.error(`Error during interaction:`, error);
            const replyOptions = { content: 'There was an error while processing this interaction!', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        }
    },
};
