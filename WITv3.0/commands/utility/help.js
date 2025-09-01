const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands.'),

    async execute(interaction) {
        // The 'interaction.client.commands' collection contains all of your command objects.
        const commands = interaction.client.commands;

        // We'll create a formatted string to list the commands.
        const commandList = commands.map(command => {
            // Get the name and description from the command's data object.
            return `**/${command.data.name}**: ${command.data.description}`;
        }).join('\n'); // Join each command string with a new line.

        const embed = new EmbedBuilder()
            .setColor(0x4E5D94) // A nice Discord blue
            .setTitle('🤖 Bot Commands')
            .setDescription(commandList)
            .setTimestamp();

        // We'll make the reply ephemeral so it only shows to the user who asked for help.
        // This keeps the channel clean.
        await interaction.reply({ embeds: [embed]});
    },
};