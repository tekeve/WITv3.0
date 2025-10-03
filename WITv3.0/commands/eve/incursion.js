const { SlashCommandBuilder } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const incursionManager = require('@helpers/incursionManager');

/**
 * Parses a relative timestring (e.g., "1d 2h 30m ago") into a Unix timestamp.
 * @param {string} timestring - The relative time string.
 * @returns {number|null} The calculated Unix timestamp in seconds or null if invalid.
 */
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
        if (unit === 'd') {
            totalSecondsAgo += value * 24 * 60 * 60;
        } else if (unit === 'h') {
            totalSecondsAgo += value * 60 * 60;
        } else if (unit === 'm') {
            totalSecondsAgo += value * 60;
        }
    }

    if (totalSecondsAgo === 0) return null;

    return Math.floor((now - totalSecondsAgo * 1000) / 1000);
}


module.exports = {
    permission: 'admin',
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
                        .setAutocomplete(true)) // Enable autocomplete
                .addNumberOption(option =>
                    option.setName('influence')
                        .setDescription('Mock influence value (a decimal from 0.0 to 1.0).')
                        .setRequired(false)
                        .setMinValue(0.0)
                        .setMaxValue(1.0))
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

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'constellation') {
            const incursionSystems = incursionManager.get();
            if (!incursionSystems) {
                await interaction.respond([]);
                return;
            }
            const choices = incursionSystems
                .map(sys => sys.Constellation)
                .filter(name => name.toLowerCase().startsWith(focusedOption.value.toLowerCase()))
                .slice(0, 25)
                .map(name => ({ name: name, value: name }));

            await interaction.respond(choices);
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply();

        if (subcommand === 'refresh') {
            interaction.client.mockOverride = null;
            await interaction.client.updateIncursions({ isManualRefresh: true });
            await interaction.editReply({ content: 'Mock state cleared. Incursion data has been refreshed from ESI and last incursion stats have been recalculated!' });

        } else if (subcommand === 'setstate') {
            const state = interaction.options.getString('state');
            const constellationName = interaction.options.getString('constellation');
            const influence = interaction.options.getNumber('influence'); // Can be null if not provided
            const spawnTimestampStr = interaction.options.getString('spawntimestamp');
            const mobilizingTimestampStr = interaction.options.getString('mobilizingtimestamp');
            const withdrawingTimestampStr = interaction.options.getString('withdrawingtimestamp');

            if (state !== 'none' && !constellationName) {
                return interaction.editReply({ content: 'You must provide a constellation name when setting an active incursion state.' });
            }

            const incursionSystems = incursionManager.get();
            if (constellationName && !incursionSystems.some(c => c.Constellation === constellationName)) {
                return interaction.editReply({ content: `Error: The constellation "${constellationName}" was not found.` });
            }

            interaction.client.mockOverride = {
                state: state,
                constellationName: constellationName,
                expires: Date.now() + (10 * 60 * 1000),
                influence: influence // Add influence to the mock object
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

