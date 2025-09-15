const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const databaseManager = require('@helpers/databaseManager');
const configManager = require('@helpers/configManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const logger = require('@helpers/logger');

/**
 * Handles all interactions originating from the /config command's interactive components.
 * This is the single entry point for all config-related interactions.
 * @param {import('discord.js').Interaction} interaction The interaction object.
 */
async function handleInteraction(interaction) {
    try {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'config_table_select') {
                await handleTableSelect(interaction);
            } else if (interaction.customId.startsWith('config_remove_select_')) {
                await handleKeyRemove(interaction);
            }
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('config_action_')) {
                const [_, __, action, tableName] = interaction.customId.split('_');
                await handleActionButton(interaction, action, tableName);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('config_modal_')) {
                const [_, __, action, tableName] = interaction.customId.split('_');
                await handleModalSubmit(interaction, action, tableName);
            }
        }
    } catch (error) {
        logger.error('Error in config interaction manager:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.followUp({ content: 'An error occurred while processing your request.', flags: [MessageFlags.Ephemeral] });
        }
    }
}

/**
 * Handles the selection from the initial "Select a Table" dropdown.
 */
async function handleTableSelect(interaction) {
    const selectedTable = interaction.values[0];
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`config_action_set_${selectedTable}`).setLabel('Add/Edit Entry').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`config_action_remove_${selectedTable}`).setLabel('Remove Entry').setStyle(ButtonStyle.Danger)
        )
    ];

    await interaction.update({
        content: `You have selected the **${selectedTable}** table. What would you like to do?`,
        components: components
    });
}

/**
 * Handles the "Add/Edit" or "Remove" button presses.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} action - The action to perform ('set' or 'remove').
 * @param {string} tableName - The table to perform the action on.
 */
async function handleActionButton(interaction, action, tableName) {
    if (action === 'set') {
        const modal = new ModalBuilder()
            .setCustomId(`config_modal_set_${tableName}`)
            .setTitle(`Editing ${tableName}`);

        const keyInput = new TextInputBuilder().setCustomId('key').setLabel('Key').setStyle(TextInputStyle.Short).setRequired(true);
        const valueInput = new TextInputBuilder().setCustomId('value').setLabel('Value (use JSON for objects/arrays)').setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(keyInput), new ActionRowBuilder().addComponents(valueInput));
        await interaction.showModal(modal);

    } else if (action === 'remove') {
        const keys = await databaseManager.getKeys(tableName);

        if (!keys || keys.length === 0) {
            return interaction.reply({
                content: `There are no entries in the **${tableName}** table to remove.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Filter out keys that are too long for Discord's select menu value field (100 char limit)
        const validKeys = keys.filter(key => key.value.length <= 100);
        const longKeysCount = keys.length - validKeys.length;

        if (validKeys.length === 0) {
            return interaction.reply({
                content: `There are no entries in the **${tableName}** table that can be removed via this menu. This may be because all entry keys are longer than 100 characters.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const options = validKeys.map(({ name: key, value }) => ({
            label: key.length > 100 ? key.substring(0, 97) + '...' : key, // Truncate label for display
            value: value, // Value must be <= 100 chars
        })).slice(0, 25);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`config_remove_select_${tableName}`)
            .setPlaceholder('Select an entry to remove')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        let content = `Select an entry to remove from the **${tableName}** table.`;
        if (longKeysCount > 0) {
            content += `\n\n*Note: ${longKeysCount} entr${longKeysCount === 1 ? 'y is' : 'ies are'} not shown because their key is too long to be selected from this menu.*`;
        }

        await interaction.reply({
            content: content,
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Handles the final removal of a key after it's selected from the dropdown.
 */
async function handleKeyRemove(interaction) {
    const tableName = interaction.customId.split('_')[3];
    const keyToRemove = interaction.values[0];

    const success = await databaseManager.removeKey(tableName, keyToRemove);

    if (success) {
        if (tableName === 'config') await configManager.reloadConfig();
        if (tableName === 'roleHierarchy') await roleHierarchyManager.reloadHierarchy();
        await interaction.update({ content: `✅ Successfully removed **${keyToRemove}** from the **${tableName}** table.`, components: [] });
    } else {
        await interaction.update({ content: `❌ Failed to remove **${keyToRemove}** from the **${tableName}** table.`, components: [] });
    }
}

/**
 * Handles the submission of the "Add/Edit" modal.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string} action - The action being performed ('set').
 * @param {string} tableName - The table to perform the action on.
 */
async function handleModalSubmit(interaction, action, tableName) {
    const key = interaction.fields.getTextInputValue('key');
    const value = interaction.fields.getTextInputValue('value');

    const success = await databaseManager.setValue(tableName, key, value);

    if (success) {
        if (tableName === 'config') await configManager.reloadConfig();
        if (tableName === 'roleHierarchy') await roleHierarchyManager.reloadHierarchy();
        await interaction.reply({ content: `✅ Successfully set **${key}** in the **${tableName}** table.`, flags: [MessageFlags.Ephemeral] });
    } else {
        await interaction.reply({ content: `❌ Failed to set value in the **${tableName}** table.`, flags: [MessageFlags.Ephemeral] });
    }
}

module.exports = { handleInteraction };

