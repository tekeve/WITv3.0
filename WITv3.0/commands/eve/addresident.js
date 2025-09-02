const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { adminRoles, addresident } = require('../../config.js');

// Dynamically create the choices for the role_set option from config.js
const roleSetChoices = Object.keys(addresident.roleSets).map(key => ({ name: key, value: key }));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addresident')
        .setDescription('Adds a new resident, assigns roles, and sends a welcome DM.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add as a resident.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role_set')
                .setDescription('The set of roles to assign.')
                .setRequired(true)
                .addChoices(...roleSetChoices)),

    async execute(interaction) {
        // 1. PERMISSION CHECK
        if (!interaction.member.roles.cache.some(role => adminRoles.includes(role.name))) {
            return interaction.reply({
                content: 'You do not have the required role to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // 2. GET INPUTS
        const targetUser = interaction.options.getUser('user');
        const roleSetName = interaction.options.getString('role_set');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);

        if (!targetMember) {
            return interaction.editReply({ content: 'Could not find that user in the server.' });
        }

        // 3. FIND AND ASSIGN ROLES
        const roleNamesToAssign = addresident.roleSets[roleSetName];
        const rolesToAssign = [];
        let notFoundRoles = [];

        // Find the actual role objects from the names in the config
        for (const roleName of roleNamesToAssign) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                rolesToAssign.push(role);
            } else {
                notFoundRoles.push(roleName);
            }
        }

        if (notFoundRoles.length > 0) {
            console.warn(`Could not find the following roles to assign: ${notFoundRoles.join(', ')}`);
        }

        if (rolesToAssign.length === 0) {
            return interaction.editReply({ content: `Error: None of the roles defined for the '${roleSetName}' set could be found. Please check the config.` });
        }

        await targetMember.roles.add(rolesToAssign);

        // 4. PREPARE AND SEND THE DIRECT MESSAGE

        // <<< START: DYNAMIC CHANNEL LINK LOGIC >>>
        // Dynamically build the fields for the welcome embed based on the config
        const welcomeFields = [
            { name: 'Next Steps', value: 'Please take a moment to review the following channels to get started:' }
        ];

        for (const [key, channelId] of Object.entries(addresident.welcomeChannels)) {
            // Try to find the channel in the server's cache
            const channel = interaction.guild.channels.cache.get(channelId);
            let fieldName;

            if (channel) {
                // If the channel is found, format its name nicely (e.g., 'rules-and-info' -> 'Rules And Info')
                fieldName = channel.name.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            } else {
                // As a fallback, format the key from config (e.g., 'getting_started' -> 'Getting Started')
                fieldName = key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                console.warn(`Could not find channel with ID ${channelId} for addresident message.`);
            }

            welcomeFields.push({ name: fieldName, value: `<#${channelId}>`, inline: true });
        }
        // <<< END: DYNAMIC CHANNEL LINK LOGIC >>>

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x3BA55D) // Green
            .setTitle(`🎉 Welcome to ${interaction.guild.name}!`)
            .setDescription(`Your roles have been updated, and you now have access to new channels and features.`)
            .addFields(welcomeFields) // Add the dynamically generated fields
            .setTimestamp()
            .setFooter({ text: `Onboarded by: ${interaction.user.tag}` });

        let dmSent = true;
        try {
            await targetUser.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            console.error(`Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`);
            dmSent = false;
        }

        // 5. SEND CONFIRMATION
        const confirmationMessage = `Successfully assigned the '${roleSetName}' roles to ${targetUser.tag}.`
            + (dmSent ? ' A welcome DM has been sent.' : ' **Warning:** Could not send a welcome DM as their DMs are likely private.');

        await interaction.editReply({ content: confirmationMessage });
    },
};

