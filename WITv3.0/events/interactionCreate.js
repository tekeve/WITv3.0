const { Events, MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const requestManager = require('@helpers/requestManager');
const mailManager = require('@helpers/mailManager');
const configInteractionManager = require('@helpers/configInteractionManager');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);
            }
            else if (interaction.isAutocomplete()) {
                const command = client.commands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;
                await command.autocomplete(interaction);
            }
            else if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'config_table_select') {
                    await configInteractionManager.handleTableSelect(interaction);
                } else if (interaction.customId.startsWith('config_key_select_')) {
                    const [, , action, tableName] = interaction.customId.split('_');
                    await configInteractionManager.handleKeySelect(interaction, action, tableName);
                }
            }
            else if (interaction.isButton()) {
                const { customId } = interaction;
                if (customId.startsWith('ticket_')) {
                    await requestManager.handleInteraction(interaction);
                } else if (customId.startsWith('config_action_')) {
                    const [, , action, tableName] = customId.split('_');
                    await configInteractionManager.handleAction(interaction, action, tableName);
                } else if (customId.startsWith('config_confirm_delete_')) {
                    const [, , , tableName, key] = customId.split('_');
                    await configInteractionManager.handleConfirmDelete(interaction, tableName, key);
                } else if (customId === 'config_cancel_delete') {
                    await interaction.update({ content: 'Deletion cancelled.', components: [], embeds: [] });
                }
            }
            else if (interaction.isModalSubmit()) {
                const { customId } = interaction;
                if (customId.startsWith('resolve_modal_')) {
                    await requestManager.handleInteraction(interaction);
                } else if (customId.startsWith('sendmail_modal_')) {
                    await mailManager.handleModal(interaction);
                } else if (customId.startsWith('config_modal_')) {
                    const [, , action, tableName, ...keyParts] = customId.split('_');
                    const key = keyParts.join('_'); // Rejoin key in case it contains underscores
                    await configInteractionManager.handleModalSubmit(interaction, action, tableName, key || null);
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