const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager'); // Use the manager
const logger = require('@helpers/logger');

// Dynamically create choices from the cached incursion data
const incursionSystems = incursionManager.get();
const constellationChoices = incursionSystems.map(sys => ({
    name: sys.Constellation,
    value: sys.Constellation,
}));
const limitedConstellationChoices = constellationChoices.slice(0, 25);

function parseTimestring(timestring) {
    const now = Date.now();
    let totalSecondsAgo = 0;
    const regex = /(\d+)\s*(d|h|m)/g;
    let match;

    if (!timestring.trim().endsWith('ago')) return null;
    const parsablePart = timestring.trim().slice(0, -3).trim();

    while ((match = regex.exec(parsablePart)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'd') totalSecondsAgo += value * 24 * 60 * 60;
        else if (unit === 'h') totalSecondsAgo += value * 60 * 60;
        else if (unit === 'm') totalSecondsAgo += value * 60;
    }

    if (totalSecondsAgo === 0) return null;
    return Math.floor((now - totalSecondsAgo * 1000) / 1000);
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('incursion')
        .setDescription('Manage and view EVE Online Incursion information.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('refresh')
                .setDescription('Manually refreshes the incursion data from ESI (clears any mock state).'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setstate')
                .setDescription('ADMIN ONLY: Manually sets the incursion state for testing.')
                .addStringOption(option =>
                    option.setName('state')
                        .setDescription('The state to set the incursion to.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Established', value: 'established' },
                            { name: 'Mobilizing', value: 'mobilizing' },
                            { name: 'Withdrawing', value: 'withdrawing' },
                            { name: 'None (Ended)', value: 'none' }
                        ))
                .addStringOption(option =>
                    option.setName('constellation')
                        .setDescription('The constellation name (required for active states).')
                        .setRequired(false)
                        .addChoices(...limitedConstellationChoices)
                )
                .addStringOption(option =>
                    option.setName('spawntimestamp')
                        .setDescription('Mock spawn time (e.g., "2d 12h ago").')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('mobilizingtimestamp')
                        .setDescription('Mock mobilizing time (e.g., "1d 3h ago").')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('withdrawingtimestamp')
                        .setDescription('Mock withdrawing time (e.g., "1h 30m ago").')
                        .setRequired(false))
        ),

    async execute(interaction) {
        const config = configManager.get();
        const hasPermission = interaction.member.roles.cache.some(role =>
            config.adminRoles.includes(role.name) || config.councilRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (subcommand === 'refresh') {
            interaction.client.mockOverride = null;
            await interaction.client.updateIncursions({ isManualRefresh: true });
            await interaction.editReply({ content: 'Mock state cleared. Incursion data has been manually refreshed from ESI!' });

        } else if (subcommand === 'setstate') {
            const state = interaction.options.getString('state');
            const constellationName = interaction.options.getString('constellation');
            const spawnTimestampStr = interaction.options.getString('spawntimestamp');
            const mobilizingTimestampStr = interaction.options.getString('mobilizingtimestamp');
            const withdrawingTimestampStr = interaction.options.getString('withdrawingtimestamp');

            if (state !== 'none' && !constellationName) {
                return interaction.editReply({ content: 'You must provide a constellation name when setting an active incursion state.' });
            }

            const allIncursionSystems = incursionManager.get();
            if (constellationName && !allIncursionSystems.some(c => c.Constellation === constellationName)) {
                return interaction.editReply({ content: `Error: The constellation "${constellationName}" was not found.` });
            }

            interaction.client.mockOverride = {
                state: state,
                constellationName: constellationName,
                expires: Date.now() + (10 * 60 * 1000)
            };

            if (spawnTimestampStr) interaction.client.mockOverride.spawnTimestamp = parseTimestring(spawnTimestampStr);
            if (mobilizingTimestampStr) interaction.client.mockOverride.mobilizingTimestamp = parseTimestring(mobilizingTimestampStr);
            if (withdrawingTimestampStr) interaction.client.mockOverride.withdrawingTimestamp = parseTimestring(withdrawingTimestampStr);

            await interaction.client.updateIncursions({ isManualRefresh: true });

            const constellationText = state !== 'none' ? ` in **${constellationName}**` : '';
            await interaction.editReply({ content: `Mock state has been set to **${state}**${constellationText} for 10 minutes. The embed has been updated.` });
        }
    },
};
