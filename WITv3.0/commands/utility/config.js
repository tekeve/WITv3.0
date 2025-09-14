const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('@helpers/dbService');
const configManager = require('@helpers/configManager'); // Import the manager
const logger = require('@helpers/logger');

// Helper to check for admin roles
const hasAdminRole = (member) => {
    // We get the admin roles from the config manager itself
    const config = configManager.get(); // Note: This assumes config is loaded.
    if (!config || !config.adminRoles) return false;
    return member.roles.cache.some(role => config.adminRoles.includes(role.name));
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration (Admin Only).')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current bot configuration.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a new value for a configuration key.')
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('The configuration key to update.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('The new JSON value for the key (e.g., ["Role1", "Role2"] or "newValue").')
                        .setRequired(true))),

    async execute(interaction) {
        // Fetch the config first thing
        const config = await configManager.get();
        const isAdmin = interaction.member.roles.cache.some(role => config.adminRoles && config.adminRoles.includes(role.name));

        if (!isAdmin) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Bot Configuration')
                .setDescription('```json\n' + JSON.stringify(config, null, 2) + '\n```')
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        } else if (subcommand === 'set') {
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');

            // Validate that the key exists
            if (!Object.prototype.hasOwnProperty.call(config, key)) {
                return interaction.reply({ content: `Error: The key "${key}" does not exist in the configuration.`, flags: [MessageFlags.Ephemeral] });
            }

            // Validate that the new value is valid JSON
            try {
                JSON.parse(value);
            } catch (error) {
                return interaction.reply({ content: 'Error: The provided value is not valid JSON. Please ensure strings are in double quotes and arrays are in square brackets, e.g., `["item1", "item2"]`.', flags: [MessageFlags.Ephemeral] });
            }

            try {
                const sql = 'UPDATE `config` SET `value` = ? WHERE `key` = ?';
                await db.query(sql, [value, key]);

                // *** THE FIX: RELOAD THE CONFIG CACHE ***
                await configManager.reloadConfig();

                logger.audit(`Config key "${key}" updated by "${interaction.user.tag}". New value: ${value}`);
                await interaction.reply({ content: `Successfully updated the configuration for key: **${key}**. The new setting is now active.`, flags: [MessageFlags.Ephemeral] });
            } catch (error) {
                logger.error('Failed to update configuration in the database:', error);
                await interaction.reply({ content: 'An error occurred while updating the configuration in the database.', flags: [MessageFlags.Ephemeral] });
            }
        }
    },
};

