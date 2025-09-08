const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const configManager = require('@helpers/configManager');
const logger = require('@helpers/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration (Admin Only).')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current configuration.')
                .addStringOption(option => option.setName('key').setDescription('A specific key to view.'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a configuration value.')
                .addStringOption(option => option.setName('key').setDescription('The configuration key to set.').setRequired(true))
                .addStringOption(option => option.setName('value').setDescription('The new value (in JSON format).').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reload')
                .setDescription('Reloads the configuration from the database.')
        ),

    async execute(interaction) {
        const config = configManager.get();
        if (!interaction.member.roles.cache.some(role => config.adminRoles.includes(role.name))) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const key = interaction.options.getString('key');
            const currentConfig = configManager.get();
            if (key) {
                if (Object.prototype.hasOwnProperty.call(currentConfig, key)) {
                    const value = JSON.stringify(currentConfig[key], null, 2);
                    const embed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(`Configuration: \`${key}\``)
                        .setDescription(`\`\`\`json\n${value.substring(0, 4080)}\n\`\`\``); // Substring to avoid exceeding limit
                    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: `Configuration key \`${key}\` not found.`, flags: [MessageFlags.Ephemeral] });
                }
            } else {
                const configString = JSON.stringify(currentConfig, null, 2);
                await interaction.reply({ content: 'Current bot configuration (may be truncated):', flags: [MessageFlags.Ephemeral] });
                // Split into chunks to avoid Discord's 2000 character limit per message
                for (let i = 0; i < configString.length; i += 1980) {
                    const chunk = configString.substring(i, i + 1980);
                    await interaction.followUp({ content: `\`\`\`json\n${chunk}\n\`\`\``, flags: [MessageFlags.Ephemeral] });
                }
            }
        } else if (subcommand === 'set') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const key = interaction.options.getString('key');
            const valueString = interaction.options.getString('value');
            let value;

            try {
                value = JSON.parse(valueString);
            } catch (error) {
                return interaction.editReply({ content: 'Invalid JSON format for the value. Please provide a valid JSON string (e.g., `"a string"`, `123`, `["item1", "item2"]`, `{"key": "value"}`).' });
            }

            const success = await configManager.setConfig(key, value);
            if (success) {
                logger.audit(`Admin "${interaction.user.tag}" updated config key "${key}" to: ${valueString}`);
                await interaction.editReply({ content: `Configuration for \`${key}\` has been updated and reloaded.` });
            } else {
                await interaction.editReply({ content: `Failed to update configuration for \`${key}\`. Check logs for details.` });
            }

        } else if (subcommand === 'reload') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                await configManager.loadConfig();
                logger.audit(`Admin "${interaction.user.tag}" reloaded the configuration from the database.`);
                await interaction.editReply({ content: 'Configuration has been reloaded from the database.' });
            } catch (error) {
                await interaction.editReply({ content: 'Failed to reload configuration. The bot might be in an unstable state. Please check the logs.' });
            }
        }
    },
};
