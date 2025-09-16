const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const tableManager = require('@helpers/managers/tableManager');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration tables using an interactive menu.'),

    async execute(interaction) {

        const tableChoices = tableManager.editableTables.map(table => {
            let label = table.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (table === 'roleHierarchy') label = 'Role Hierarchy'; // Specific label
            return { label, value: table };
        });

        const tableSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_table_select')
            .setPlaceholder('Select a configuration table to manage...')
            .addOptions(tableChoices);

        const row = new ActionRowBuilder().addComponents(tableSelectMenu);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Bot Configuration Manager')
            .setDescription('Please select a table from the dropdown menu below to begin adding, editing, or deleting entries.');

        await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    },
};

