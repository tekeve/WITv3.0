const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const roleManager = require('@helpers/roleManager');

module.exports = {
    permissions: ['public'],
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands you have permission to use.'),

    async execute(interaction) {
        const member = interaction.member;
        const commands = interaction.client.commands;

        // An object mapping permission level names to their checking functions.
        // This ensures that even if old command files use a single permission string,
        // we can still resolve it to the correct hierarchical check.
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
            const requiredPermissions = command.permissions || ['admin'];
            // This now checks if the member passes ANY of the required permission checks.
            return requiredPermissions.some(p => {
                const check = permissionChecks[p];
                return check ? check(member) : false;
            });
        });

        const commandList = availableCommands
            .map(command => `**/${command.data.name}**: ${command.data.description}`)
            .sort() // Sort the commands alphabetically
            .join('\n');

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

