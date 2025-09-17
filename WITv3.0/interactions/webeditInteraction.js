const { v4: uuidv4 } = require('uuid');
const logger = require('@helpers/logger');

/**
 * Handles the selection from the table dropdown menu.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleTableSelect(interaction) {
    const selectedTable = interaction.values[0];

    // Generate a unique, single-use token for the web link.
    const token = uuidv4();

    // Store the token with the user's info and the table they want to edit.
    interaction.client.activeWebEditTokens.set(token, {
        user: interaction.user,
        tableName: selectedTable
    });

    // Set the token to expire after a set time to enhance security.
    const EXPIRATION_MINUTES = 30;
    setTimeout(() => {
        if (interaction.client.activeWebEditTokens.has(token)) {
            logger.warn(`WebEdit Token ${token} for ${interaction.user.tag} has expired.`);
            interaction.client.activeWebEditTokens.delete(token);
        }
    }, EXPIRATION_MINUTES * 60 * 1000);

    // Construct the URL and send it to the user.
    const formUrl = `http://${process.env.WEB_HOST_NAME || 'localhost:3000'}/webedit/${token}`;

    await interaction.update({ // Update the original message with the link.
        content: `Click the button below to open the web editor for the **${selectedTable}** table. This link will expire in **${EXPIRATION_MINUTES} minutes**.`,
        components: [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        label: `Edit '${selectedTable}' Table`,
                        style: 5, // Link Style
                        url: formUrl
                    }
                ]
            }
        ]
    });
}

/**
 * The main entry point for interactions related to the web editor.
 * @param {import('discord.js').Interaction} interaction 
 */
async function handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'webedit_table_select') {
        await handleTableSelect(interaction);
    }
}

module.exports = { handleInteraction };
