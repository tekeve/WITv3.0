const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    permissions: ['public'],
    data: new SlashCommandBuilder()
        .setName('loganalysis')
        .setDescription('Provides a link to the EVE Online combat log analysis tool.'),

    async execute(interaction) {
        const formUrl = `http://${process.env.HOST_NAME}/loganalysis`;

        await interaction.reply({
            content: `Click the button below to open the **Combat Log Analysis Tool**.`,
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Open Log Analyzer`,
                    style: 5,
                    url: formUrl
                }]
            }],
            flags: [MessageFlags.Ephemeral]
        });
    }
};
