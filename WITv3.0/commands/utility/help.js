const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const roleManager = require('@helpers/roleManager');

module.exports = {
    // Each command should export a 'permission' property.
    // This allows the help command and interaction handler to check permissions dynamically.
    permission: ['public'],
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands you have permission to use.'),

    async execute(interaction) {
        const member = interaction.member;
        const commands = interaction.client.commands;

        // An object mapping permission levels to checking functions from roleManager
        const permissionChecks = {
            admin: roleManager.isAdmin,
            founder: roleManager.isFounderOrHigher,
            leadership: roleManager.isLeadershipOrHigher,
            officer: roleManager.isOfficerOrHigher,
            council: roleManager.isCouncilOrHigher,
            certified_trainer: roleManager.isCertifiedTrainerOrHigher,
            training_ct: roleManager.isTrainingCtOrHigher,
            fleet_commander: roleManager.isFleetCommanderOrHigher,
            training_fc: roleManager.isTrainingFcOrHigher,
            assault_line_commander: roleManager.isAssaultLineCommanderOrHigher,
            line_commander: roleManager.isLineCommanderOrHigher,
            resident: roleManager.isResidentOrHigher,
            commander: roleManager.isCommanderOrHigher,
            auth: roleManager.canAuth,
            public: () => true, // Everyone can use public commands
        };

        const availableCommands = commands.filter(command => {
            // Default to 'admin' permission if not specified on the command file
            const requiredPermission = command.permission || 'admin';
            const hasPermission = permissionChecks[requiredPermission];
            return hasPermission ? hasPermission(member) : false;
        });

        const commandList = availableCommands.map(command => {
            return `**/${command.data.name}**: ${command.data.description}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x4E5D94)
            .setTitle('🤖 Your Available Commands')
            .setDescription(commandList || 'You do not have permission to use any commands.')
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            flags: [MessageFlags.Ephemeral]
        });
    },
};

