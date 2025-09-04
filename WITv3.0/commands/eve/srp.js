const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { adminRoles, commanderRoles } = require('../../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('srp')
        .setDescription('Submit a Ship Replacement Program (SRP) request.'),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role =>
            adminRoles.includes(role.name) || commanderRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Create the modal for the SRP request.
        const modal = new ModalBuilder()
            .setCustomId('srp_modal_part1')
            .setTitle('SRP Request');

        // Create the text input components for the modal.
        const pilotNameInput = new TextInputBuilder()
            .setCustomId('srp_pilot_name')
            .setLabel("Pilot's Name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('The name of the character who lost the ship')
            .setRequired(true);

        const killReportInput = new TextInputBuilder()
            .setCustomId('srp_kill_report')
            .setLabel("Kill Report URL")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., https://zkillboard.com/kill/...')
            .setRequired(true);

        const killValueInput = new TextInputBuilder()
            .setCustomId('srp_kill_value')
            .setLabel("Kill Report ISK Value")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1,500,000,000')
            .setRequired(true);

        const fcNameInput = new TextInputBuilder()
            .setCustomId('srp_fc_name')
            .setLabel("FC's Name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("The name of the fleet commander")
            .setRequired(true);

        const shipTypeInput = new TextInputBuilder()
            .setCustomId('srp_ship_type')
            .setLabel("Type of Ship Lost")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Vindicator, Nightmare, Basilisk')
            .setRequired(true);

        // Add inputs to the modal using separate ActionRows to avoid Discord API limits.
        modal.addComponents(
            new ActionRowBuilder().addComponents(pilotNameInput),
            new ActionRowBuilder().addComponents(killReportInput),
            new ActionRowBuilder().addComponents(killValueInput),
            new ActionRowBuilder().addComponents(fcNameInput),
            new ActionRowBuilder().addComponents(shipTypeInput)
        );

        // Show the modal to the user.
        await interaction.showModal(modal);
    },
};
