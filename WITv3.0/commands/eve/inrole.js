const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const charManager = require('@helpers/characterManager');

module.exports = {
    permissions: ['commander', 'resident', 'line_commander', 'assault_line_commander', 'training_fc', 'fleet_commander', 'training_ct', 'certified_trainer', 'council', 'officer', 'leadership', 'founder', 'admin'],
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('Lists the main characters of users with a specific Discord role.')
        .addStringOption(option => // Changed from addRoleOption to addStringOption
            option.setName('role')
                .setDescription('The Discord role to look up (start typing to search)')
                .setRequired(true)
                .setAutocomplete(true)), // Enabled autocomplete

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const roles = interaction.guild.roles.cache
            // Filter out managed roles (from bots/integrations) and @everyone
            .filter(role => !role.managed && role.name !== '@everyone')
            // Filter based on what the user is typing
            .filter(role => role.name.toLowerCase().startsWith(focusedValue.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

        await interaction.respond(
            // Map to the required format {name, value} and limit to Discord's max of 25 choices
            roles.map(role => ({ name: role.name, value: role.id })).slice(0, 25)
        );
    },

    async execute(interaction) {
        // FIX: Use .get('role').value to robustly get the role ID string,
        // regardless of whether Discord sends it as a STRING or a resolved ROLE object.
        const roleId = interaction.options.get('role').value;
        const targetRole = await interaction.guild.roles.fetch(roleId).catch(() => null);

        // Check if the role actually exists in the server
        if (!targetRole) {
            return interaction.reply({
                content: `Could not find the specified role. Please select one from the list.`,
                ephemeral: true
            });
        }

        // The 'managed' check is kept as a fallback, although the autocomplete prevents this from being selected.
        if (targetRole.managed) {
            return interaction.reply({
                content: `The role **${targetRole.name}** is managed by an external integration and cannot be queried. Please select a server-managed role.`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const users = await charManager.findUsersInRole(targetRole.id);

        if (users.length === 0) {
            return interaction.editReply({ content: `No registered users found with the role **${targetRole.name}**.` });
        }

        const charList = users.map(user => `- ${user.main_character_name}`);
        let description = charList.join('\n');

        // Truncate description if it exceeds Discord's limit
        if (description.length > 4096) {
            const averageLineLength = description.length / charList.length;
            const maxLines = Math.floor(4000 / averageLineLength);
            description = charList.slice(0, maxLines).join('\n') + `\n... and ${charList.length - maxLines} more.`;
        }

        const embed = new EmbedBuilder()
            .setColor(targetRole.color || 0x5865F2) // Use role color or a default blue
            .setTitle(`Main Characters with Role: ${targetRole.name} (${users.length})`)
            .setDescription(description)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

