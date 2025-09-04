const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { adminRoles, commanderRoles, councilRoles, authRoles } = require('../../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands you have permission to use.'),

    async execute(interaction) {
        const member = interaction.member;
        const commands = interaction.client.commands;

        // Helper functions to check for role categories
        const isAdmin = member.roles.cache.some(role => adminRoles.includes(role.name));
        const isCouncil = member.roles.cache.some(role => councilRoles.includes(role.name));
        const isCommander = member.roles.cache.some(role => commanderRoles.includes(role.name));
        const canAuth = member.roles.cache.some(role => authRoles.includes(role.name));

        // Define which commands fall into which permission groups
        const commandPermissions = {
            'promote': isAdmin,
            'demote': isAdmin,
            'setstatus': isAdmin,
            'refreshroles': isAdmin,
            'sheet': isAdmin,
            'doc': isAdmin,
            'sendmail': isAdmin,
            'maillists': isAdmin,
            'incursion': isAdmin || isCouncil,
            'inrole': isAdmin || isCommander,
            'addchar': isAdmin || isCommander,
            'delchar': isAdmin || isCommander,
            'getchar': isAdmin || isCommander,
            'srp': isAdmin || isCommander,
            'request': isAdmin || isCommander,
            'auth': canAuth,
            'ping': true, // Assuming ping is for everyone
            'help': true, // Help is always available
        };

        // Filter commands based on the user's permissions
        const availableCommands = commands.filter(command => commandPermissions[command.data.name]);

        const commandList = availableCommands.map(command => {
            return `**/${command.data.name}**: ${command.data.description}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x4E5D94)
            .setTitle('🤖 Your Available Commands')
            .setDescription(commandList || 'You do not have permission to use any commands.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    },
};
