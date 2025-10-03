const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('permissions')
        .setDescription('Displays the permission levels for all bot commands for auditing.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const commands = interaction.client.commands;
        const permissionsMap = {
            admin: [],
            council: [],
            commander: [],
            auth: [],
            public: []
        };

        // Helper function to format the command name with its subcommands
        const formatCommand = (command) => {
            let commandString = `/${command.data.name}`;

            // Check for subcommands by inspecting the options
            const subcommands = command.data.options.filter(
                opt => opt.toJSON().type === 1 // 1 corresponds to SUB_COMMAND
            );

            if (subcommands.length > 0) {
                const subcommandNames = subcommands.map(sub => sub.name).join(', ');
                commandString += ` [${subcommandNames}]`;
            }
            return commandString;
        };

        // Group commands by their permission level
        commands.forEach(command => {
            const permissionLevel = command.permission || 'admin'; // Default to admin if not specified
            if (permissionsMap[permissionLevel]) {
                permissionsMap[permissionLevel].push(formatCommand(command));
            }
        });

        const embed = new EmbedBuilder()
            .setColor(0x4E5D94)
            .setTitle('Bot Command Permissions Audit')
            .setDescription('A complete list of all registered commands and their required permission levels.')
            .setTimestamp();

        // Dynamically add a field for each permission level that has commands
        for (const [level, commandList] of Object.entries(permissionsMap)) {
            if (commandList.length > 0) {
                const title = `🔒 ${level.charAt(0).toUpperCase() + level.slice(1)} Level`;
                embed.addFields({
                    name: title,
                    // Using code blocks for better readability
                    value: '`' + commandList.sort().join('`\n`') + '`'
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
