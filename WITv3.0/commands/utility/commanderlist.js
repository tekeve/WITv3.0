const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getSheetsService } = require('@helpers/googleAuth.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

/**
 * This is the core logic for updating the commander sheet. It can be called
 * from the slash command or from a scheduled task.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @returns {Promise<{success: boolean, changes: Map<string, {added: string[], removed: string[]}>}>}
 */
async function runCommanderListUpdate(client) {
    const changes = new Map();
    try {
        logger.info('[CommanderListUpdate] Starting sheet update process...');
        const sheets = await getSheetsService();
        const config = configManager.get();
        const spreadsheetId = config.googleSheets['CommandCoreList'];

        if (!spreadsheetId) {
            logger.error('[CommanderListUpdate] Spreadsheet ID for alias "CommandCoreList" not found in config.');
            return { success: false, changes };
        }

        const sheetName = 'DiscordPull';
        const range = `${sheetName}!A2:J`;
        const roleListArray = ["fleet commander", "training fc", "line commander", "resident", "commander"];

        // Read old data for comparison
        const oldData = new Map();
        try {
            const getResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range });
            const oldValues = getResponse.data.values || [];
            roleListArray.forEach((roleName, index) => {
                const nameColumnIndex = index * 2 + 1;
                oldData.set(roleName, new Set(oldValues[nameColumnIndex] || []));
            });
        } catch (err) {
            logger.warn(`[CommanderListUpdate] Could not read old sheet data, proceeding as if empty. Error: ${err.message}`);
            roleListArray.forEach(roleName => oldData.set(roleName, new Set()));
        }

        // Fetch fresh data from Discord
        const wtmGuild = client.guilds.cache.get('295568584409743361');
        if (!wtmGuild) {
            logger.error('[CommanderListUpdate] Could not find the target Discord server.');
            return { success: false, changes };
        }
        await wtmGuild.members.fetch();

        const newData = new Map();
        const roleOutputForSheet = [];
        for (const roleName of roleListArray) {
            const role = wtmGuild.roles.cache.find(r => r.name.toLowerCase() === roleName);
            if (role) {
                const members = role.members;
                const memberIds = members.map(m => m.id);
                const memberNames = members.map(m => m.displayName);
                roleOutputForSheet.push(memberIds, memberNames);
                newData.set(roleName, new Set(memberNames));
            } else {
                roleOutputForSheet.push([], []);
                newData.set(roleName, new Set());
            }
        }

        // Update Google Sheet
        await sheets.spreadsheets.values.clear({ spreadsheetId, range });
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'USER_ENTERED',
            resource: { majorDimension: 'COLUMNS', values: roleOutputForSheet },
        });
        logger.success('[CommanderListUpdate] Google Sheet has been updated successfully.');

        // Calculate changes
        for (const roleName of roleListArray) {
            const oldMembers = oldData.get(roleName);
            const newMembers = newData.get(roleName);
            const added = [...newMembers].filter(member => !oldMembers.has(member));
            const removed = [...oldMembers].filter(member => !newMembers.has(member));
            if (added.length > 0 || removed.length > 0) {
                changes.set(roleName, { added, removed });
            }
        }

        return { success: true, changes };

    } catch (error) {
        logger.error('An error occurred during the commander list update process:', error);
        return { success: false, changes };
    }
}

module.exports = {
    permission: 'council',
    data: new SlashCommandBuilder()
        .setName('commanderlist')
        .setDescription('Updates the Google Sheet with the current list of commanders and provides a report.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { success, changes } = await runCommanderListUpdate(interaction.client);

        if (!success) {
            return interaction.editReply('❌ An error occurred while updating the sheet. Please check the bot logs.');
        }

        await interaction.editReply('✅ Successfully updated the Commander Core List Google Sheet. Generating report...');

        const reportEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Commander List Update Report')
            .setTimestamp();

        if (changes.size === 0) {
            reportEmbed.setDescription('No changes detected in any of the monitored roles. The sheet is up to date.');
        } else {
            reportEmbed.setDescription('The following changes were detected and synced to the sheet:');
            for (const [roleName, changeData] of changes.entries()) {
                let value = '';
                if (changeData.added.length > 0) {
                    value += `**Added:**\n- ${changeData.added.join('\n- ')}\n\n`;
                }
                if (changeData.removed.length > 0) {
                    value += `**Removed:**\n- ${changeData.removed.join('\n- ')}`;
                }
                reportEmbed.addFields({
                    name: roleName.replace(/\b\w/g, l => l.toUpperCase()),
                    value: value.trim().substring(0, 1024),
                    inline: false
                });
            }
        }

        await interaction.followUp({ embeds: [reportEmbed], flags: [MessageFlags.Ephemeral] });
    },
    // Export the core function so our scheduler can use it
    runCommanderListUpdate,
};

