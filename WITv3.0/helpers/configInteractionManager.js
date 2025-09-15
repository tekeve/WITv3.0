const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const databaseManager = require('@helpers/databaseManager');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

// --- Handlers for each step of the interaction flow ---

/**
 * Handles the initial table selection from the dropdown.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleTableSelect(interaction) {
    const selectedTable = interaction.values[0];

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Managing Table: \`${selectedTable}\``)
        .setDescription('Please select an action to perform on this table.');

    const actionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`config_action_add_${selectedTable}`)
                .setLabel('Add Row')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId(`config_action_edit_${selectedTable}`)
                .setLabel('Edit Row')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`config_action_delete_${selectedTable}`)
                .setLabel('Delete Row')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

    await interaction.update({ embeds: [embed], components: [actionButtons] });
}

/**
 * Handles the button press for "Add", "Edit", or "Delete".
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @param {string} action 
 * @param {string} tableName 
 */
async function handleAction(interaction, action, tableName) {
    if (action === 'add') {
        const modal = new ModalBuilder()
            .setCustomId(`config_modal_add_${tableName}`)
            .setTitle(`Add to '${tableName}'`);

        const keyInput = new TextInputBuilder()
            .setCustomId('key_input')
            .setLabel('Key')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('The name of the key (e.g., adminRoles)')
            .setRequired(true);

        const valueInput = new TextInputBuilder()
            .setCustomId('value_input')
            .setLabel('Value')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('The value (use JSON for arrays/objects)')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(keyInput), new ActionRowBuilder().addComponents(valueInput));
        await interaction.showModal(modal);

    } else if (action === 'edit' || action === 'delete') {
        const keys = await databaseManager.getAllKeys(tableName);

        if (keys.length === 0) {
            return interaction.update({ content: `The table '${tableName}' has no rows to ${action}.`, components: [], embeds: [] });
        }

        const options = keys.slice(0, 25).map(key => ({
            label: key.substring(0, 100), // Max label length is 100
            value: key.substring(0, 100), // Max value length is 100
        }));

        const keySelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`config_key_select_${action}_${tableName}`)
            .setPlaceholder(`Select a key to ${action}...`)
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor(action === 'edit' ? 0x3498DB : 0xE74C3C)
            .setTitle(`Select a Key to ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`You are about to ${action} a row from the \`${tableName}\` table.`);

        await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(keySelectMenu)] });
    }
}

/**
 * Handles the selection of a key to edit or delete.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 * @param {string} action 
 * @param {string} tableName 
 */
async function handleKeySelect(interaction, action, tableName) {
    const selectedKey = interaction.values[0];

    if (action === 'edit') {
        const currentValue = await databaseManager.getValue(tableName, selectedKey);

        const modal = new ModalBuilder()
            .setCustomId(`config_modal_edit_${tableName}_${selectedKey}`)
            .setTitle(`Edit '${selectedKey}'`);

        const valueInput = new TextInputBuilder()
            .setCustomId('value_input')
            .setLabel('New Value')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentValue || '') // Pre-fill with current value
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(valueInput));
        await interaction.showModal(modal);
    } else if (action === 'delete') {
        const embed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('Confirm Deletion')
            .setDescription(`Are you sure you want to delete the key \`${selectedKey}\` from the \`${tableName}\` table? This action cannot be undone.`);

        const confirmationButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`config_confirm_delete_${tableName}_${selectedKey}`)
                    .setLabel('Confirm Delete')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_cancel_delete')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
        await interaction.update({ embeds: [embed], components: [confirmationButtons] });
    }
}

/**
 * Handles the final confirmation of a deletion.
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @param {string} tableName 
 * @param {string} key 
 */
async function handleConfirmDelete(interaction, tableName, key) {
    const success = await databaseManager.removeKey(tableName, key);
    if (success) {
        if (tableName === 'config') {
            await configManager.reloadConfig();
        }
        await interaction.update({ content: `✅ Successfully deleted **${key}** from table **${tableName}**.`, components: [], embeds: [] });
    } else {
        await interaction.update({ content: `❌ Failed to delete key. The table "${tableName}" may not be editable or the key no longer exists.`, components: [], embeds: [] });
    }
}

/**
 * Handles modal submissions for adding or editing rows.
 * @param {import('discord.js').ModalSubmitInteraction} interaction 
 * @param {string} action 
 * @param {string} tableName 
 * @param {string|null} key 
 */
async function handleModalSubmit(interaction, action, tableName, key) {
    const value = interaction.fields.getTextInputValue('value_input');
    const keyFromModal = action === 'add' ? interaction.fields.getTextInputValue('key_input') : key;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const success = await databaseManager.setValue(tableName, keyFromModal, value);

    if (success) {
        if (tableName === 'config') {
            await configManager.reloadConfig();
        }
        await interaction.editReply({ content: `✅ Successfully **${action}ed** the key \`${keyFromModal}\` in the \`${tableName}\` table.` });
        // Update the original message to show completion
        await interaction.message.edit({ content: `Action completed on table \`${tableName}\`. You can dismiss this message or run /config again.`, components: [], embeds: [] }).catch(e => logger.warn('Could not edit original config message after modal submit.'));

    } else {
        await interaction.editReply({ content: `❌ Failed to set value. The table "${tableName}" may not be editable.` });
    }
}


module.exports = {
    handleTableSelect,
    handleAction,
    handleKeySelect,
    handleConfirmDelete,
    handleModalSubmit,
};
