const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const incursionManager = require('@helpers/incursionManager');
const logger = require('@helpers/logger');

module.exports = {
    permission: 'admin',
    data: new SlashCommandBuilder()
        .setName('datasync')
        .setDescription('Verifies and updates internal static data from ESI. CAUSES A LOT OF ESI CALLS!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('incursionsystems')
                .setDescription('Verifies and updates the incursion systems table against ESI data. CAUSES A LOT OF ESI CALLS!')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'incursionsystems') {
            await interaction.reply({ content: 'Starting verification and sync for `incursion_systems` table. This may take a moment...', flags: [MessageFlags.Ephemeral] });

            try {
                const report = await incursionManager.verifyAndSyncIncursionSystems();

                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('Incursion Systems Data Sync Report')
                    .setTimestamp();

                if (report.updated.length === 0 && report.failed.length === 0) {
                    embed.setDescription(`✅ All **${report.unchanged}** constellation records are up-to-date. No changes were needed.`);
                } else {
                    embed.addFields(
                        { name: '✅ Up-to-Date', value: `${report.unchanged} constellations`, inline: true },
                        { name: '🔄 Updated', value: `${report.updated.length} constellations`, inline: true },
                        { name: '❌ Failed', value: `${report.failed.length} constellations`, inline: true }
                    );

                    // Add details for updated constellations, up to 10 to avoid huge embeds
                    if (report.updated.length > 0) {
                        const updatedFields = report.updated.slice(0, 10).map(item => ({
                            name: `Updated: ${item.name}`,
                            value: item.changes
                        }));
                        embed.addFields(updatedFields);
                        if (report.updated.length > 10) {
                            embed.addFields({ name: '...', value: `*and ${report.updated.length - 10} more...*` });
                        }
                    }

                    // Add details for failed constellations
                    if (report.failed.length > 0) {
                        const failedFields = report.failed.map(item => ({
                            name: `Failed: ${item.name}`,
                            value: `Reason: ${item.reason}`
                        }));
                        embed.addFields(failedFields);
                    }
                }

                await interaction.followUp({ embeds: [embed], flags: [MessageFlags.Ephemeral] });

            } catch (error) {
                logger.error('Critical error during datasync command for incursion systems:', error);
                await interaction.followUp({ content: 'A critical error occurred during the sync process. Please check the logs.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};
