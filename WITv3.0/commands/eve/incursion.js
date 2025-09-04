const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { adminRoles } = require('../../config.js');
const incursionSystems = require('../../helpers/incursionsystem.json');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = path.join(__dirname, '..', '..', 'state.json');

// Create choices for the constellation option dynamically from the JSON file
const constellationChoices = incursionSystems.map(sys => ({
    name: sys.Constellation,
    value: sys.Constellation,
}));
// Discord has a limit of 25 choices for slash command options
const limitedConstellationChoices = constellationChoices.slice(0, 25);

/**
 * Parses a relative timestring (e.g., "1d 2h 30m ago") into a Unix timestamp.
 * @param {string} timestring - The relative time string.
 * @returns {number} The calculated Unix timestamp in seconds.
 */
function parseTimestring(timestring) {
    const now = Date.now();
    let totalSecondsAgo = 0;
    const regex = /(\d+)\s*(d|h|m)/g;
    let match;

    // Ensure the string ends with "ago" for safety, then remove it
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
    data: new SlashCommandBuilder()
        .setName('incursion')
        .setDescription('Manage and view EVE Online Incursion information. (Admin Only)')
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
        const hasPermission = interaction.member.roles.cache.some(role => adminRoles.includes(role.name));

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Read current state file
        let stateData;
        try {
            stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch (e) {
            stateData = {}; // create if doesn't exist
        }

        if (subcommand === 'refresh') {
            // Clear any mock override when manually refreshing
            if (stateData.mockOverride) {
                delete stateData.mockOverride;
                fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));
            }
            // Trigger an update, which will now use ESI data
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

            if (constellationName && !incursionSystems.some(c => c.Constellation === constellationName)) {
                return interaction.editReply({ content: `Error: The constellation "${constellationName}" was not found.` });
            }

            // Set the mock override in the state file, expiring in 10 minutes
            stateData.mockOverride = {
                state: state,
                constellationName: constellationName,
                expires: Date.now() + (10 * 60 * 1000)
            };

            // Parse and add any provided timestamps
            if (spawnTimestampStr) stateData.mockOverride.spawnTimestamp = parseTimestring(spawnTimestampStr);
            if (mobilizingTimestampStr) stateData.mockOverride.mobilizingTimestamp = parseTimestring(mobilizingTimestampStr);
            if (withdrawingTimestampStr) stateData.mockOverride.withdrawingTimestamp = parseTimestring(withdrawingTimestampStr);


            fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));

            // Trigger an immediate update which will now use the override
            await interaction.client.updateIncursions({ isManualRefresh: true });

            const constellationText = state !== 'none' ? ` in **${constellationName}**` : '';
            await interaction.editReply({ content: `Mock state has been set to **${state}**${constellationText} for 10 minutes. The embed has been updated.` });
        }
    },
};

