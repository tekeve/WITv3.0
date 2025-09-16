const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const roleManager = require('@helpers/roleManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands you have permission to use.'),

    async execute(interaction) {
        const member = interaction.member;
        const commands = interaction.client.commands;

        // Centralized permission checks from roleManager
        const isAdmin = roleManager.isAdmin(member);
        const isCouncil = roleManager.isCouncil(member);
        const isCommander = roleManager.isCommander(member);
        const canAuth = roleManager.canAuth(member);

        // Define which commands fall into which permission groups
        // This structure makes it easy to see who can run what.
        const commandPermissions = {
            'promote': isAdmin,
            'demote': isAdmin,
            'setstatus': isAdmin,
            'refreshroles': isAdmin,
            'sheet': isAdmin,
            'doc': isAdmin,
            'sendmail': isAdmin,
            'maillists': isAdmin,
            'config': isAdmin,
            'incursion': isAdmin || isCouncil,
            'inrole': isAdmin || isCommander,
            'addchar': isAdmin || isCommander,
            'delchar': isAdmin || isCommander,
            'getchar': isAdmin || isCommander,
            'srp': isAdmin || isCommander,
            'request': isAdmin || isCommander,
            'auth': canAuth,
            'ping': true, // Everyone can use ping
            'help': true,  // Everyone can use help
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

        await interaction.reply({ embeds: [embed]});
    },
};
