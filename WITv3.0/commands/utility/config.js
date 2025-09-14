const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const roleManager = require('@helpers/roleManager');
const databaseManager = require('@helpers/databaseManager');
const configManager = require('@helpers/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current core bot configuration.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Add or update a configuration value.')
                .addStringOption(option =>
                    option.setName('table')
                        .setDescription('The configuration table to edit.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Core Config', value: 'config' },
                            { name: 'Google Docs', value: 'google_docs' },
                            { name: 'Google Sheets', value: 'google_sheets' }
                        ))
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('The configuration key to set (e.g., adminRoles).')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('The new value for the key (use JSON for arrays/objects).')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a configuration entry.')
                .addStringOption(option =>
                    option.setName('table')
                        .setDescription('The configuration table to edit.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Core Config', value: 'config' },
                            { name: 'Google Docs', value: 'google_docs' },
                            { name: 'Google Sheets', value: 'google_sheets' }
                        ))
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('The key of the entry to remove.')
                        .setRequired(true)
                        .setAutocomplete(true))
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const table = interaction.options.getString('table');

        if (focusedOption.name === 'key' && table) {
            const keys = await databaseManager.getKeys(table);
            const filtered = keys.filter(key => key.startsWith(focusedOption.value)).slice(0, 25);
            await interaction.respond(
                filtered.map(key => ({ name: key, value: key })),
            );
        }
    },

    async execute(interaction) {
        if (!roleManager.isAdmin(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this command.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            await interaction.deferReply();

            const config = configManager.get();
            if (!config || Object.keys(config).length === 0) {
                return interaction.editReply({ content: 'Configuration is not loaded or is empty.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('Current Bot Configuration')
                .setColor(0x0099FF)
                .setTimestamp();

            const fields = [];
            const MAX_FIELD_VALUE_LENGTH = 1024;
            const CODE_BLOCK_MARKDOWN_LENGTH = '```json\n'.length + '```'.length;

            for (const [key, value] of Object.entries(config)) {
                let valueString = JSON.stringify(value, null, 2);

                if (valueString.length + CODE_BLOCK_MARKDOWN_LENGTH > MAX_FIELD_VALUE_LENGTH) {
                    const truncateLength = MAX_FIELD_VALUE_LENGTH - CODE_BLOCK_MARKDOWN_LENGTH - '...'.length;
                    valueString = valueString.substring(0, truncateLength) + '...';
                }

                if (fields.length < 25) {
                    fields.push({ name: key, value: `\`\`\`json\n${valueString}\`\`\`` });
                } else {
                    break;
                }
            }

            if (fields.length > 0) {
                embed.addFields(fields);
            } else {
                embed.setDescription('No configuration settings found.');
            }

            if (Object.keys(config).length > 25) {
                embed.setFooter({ text: 'Note: Configuration has more than 25 entries. Only the first 25 are shown.' });
            }

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'set') {
            await interaction.deferReply();
            const table = interaction.options.getString('table');
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');

            const success = await databaseManager.setValue(table, key, value);

            if (success) {
                if (table === 'config') {
                    await configManager.reloadConfig();
                }
                await interaction.editReply({ content: `Successfully set **${key}** in table **${table}**.` });
            } else {
                await interaction.editReply({ content: `Failed to set value. The table "${table}" may not be editable.` });
            }
        } else if (subcommand === 'remove') {
            await interaction.deferReply();
            const table = interaction.options.getString('table');
            const key = interaction.options.getString('key');

            const success = await databaseManager.removeKey(table, key);

            if (success) {
                if (table === 'config') {
                    await configManager.reloadConfig();
                }
                await interaction.editReply({ content: `Successfully removed **${key}** from table **${table}**.` });
            } else {
                await interaction.editReply({ content: `Failed to remove key. The table "${table}" may not be editable.` });
            }
        }
    },
};
