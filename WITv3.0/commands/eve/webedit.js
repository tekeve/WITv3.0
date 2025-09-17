const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const tableManager = require('@helpers/managers/tableManager');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('webedit')
        .setDescription('Generates a link to edit a database table via a web interface.'),

    async execute(interaction) {
        // Create a dropdown menu with all the tables that are safe to edit.
        const tableChoices = tableManager.editableTables.map(table => {
            // Format the table name for display in the dropdown.
            let label = table.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (table === 'roleHierarchy') label = 'Role Hierarchy'; // Specific label for readability
            return { label, value: table };
        });

        const tableSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('webedit_table_select') // A unique ID to identify this specific menu.
            .setPlaceholder('Select a table to edit...')
            .addOptions(tableChoices);

        const row = new ActionRowBuilder().addComponents(tableSelectMenu);

        // Reply to the user with the dropdown menu.
        await interaction.reply({
            content: 'Please select a database table you would like to edit from the menu below.',
            components: [row],
            flags: [MessageFlags.Ephemeral] // Only visible to the user who ran the command.
        });
    },
};
