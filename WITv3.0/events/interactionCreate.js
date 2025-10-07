const { Events, MessageFlags } = require('discord.js');
const logger = require('@helpers/logger');
const requestManager = require('@helpers/requestManager');
const mailManager = require('@helpers/mailManager');
const webEditInteractionManager = require('@interactions/webeditInteraction');
const roleManager = require('@helpers/roleManager');
const auditLogger = require('@helpers/auditLogger');
const ErrorHandler = require('@helpers/errorHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        try {
            if (interaction.isChatInputCommand()) {
                await handleChatInputCommand(interaction, client);
            }
            else if (interaction.isAutocomplete()) {
                await handleAutocomplete(interaction, client);
            }
            else if (interaction.isStringSelectMenu()) {
                await handleStringSelectMenu(interaction);
            }
            else if (interaction.isButton()) {
                await handleButton(interaction);
            }
            else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction);
            }
            else {
                logger.warn(`Unhandled interaction type: ${interaction.type}`);
            }
        } catch (error) {
            // Final fallback error handler for the entire interaction system
            await ErrorHandler.handleDiscordError(
                error,
                `processing ${interaction.type} interaction${interaction.commandName ? ` (${interaction.commandName})` : ''}`,
                interaction
            );
        }
    },
};

/**
 * Handles chat input (slash) commands
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @param {import('discord.js').Client} client 
 */
async function handleChatInputCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        logger.warn(`Command not found: ${interaction.commandName}`);
        return;
    }

    try {
        // Log the command usage
        await auditLogger.logCommand(interaction);
    } catch (auditError) {
        logger.error('Failed to log command usage:', auditError);
        // Continue execution despite audit log failure
    }

    // Dynamic Permissions Check with enhanced error handling
    try {
        const requiredPermissions = Array.isArray(command.permissions) ? command.permissions : [command.permissions || 'admin'];

        if (!roleManager.hasPermission(interaction.member, requiredPermissions)) {
            return await interaction.reply({
                content: '❌ You do not have the required permission to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Execute command with timeout protection
        const commandPromise = command.execute(interaction);
        const timeoutPromise = ErrorHandler.withTimeout(
            commandPromise,
            30000, // 30 second timeout
            `command ${interaction.commandName}`
        );

        await timeoutPromise;

        // Log successful command execution
        logger.info(`Successfully executed command: ${interaction.commandName} by ${interaction.user.tag}`);

    } catch (error) {
        // Enhanced error handling for command execution
        const errorContext = `executing command: ${interaction.commandName}`;

        // Check if this is a timeout error
        if (error.message.includes('timed out')) {
            logger.error(`Command timeout: ${interaction.commandName} by ${interaction.user.tag}`);

            // Try to respond if possible
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '⏰ Command timed out. Please try again in a moment.',
                        flags: [MessageFlags.Ephemeral]
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: '⏰ Command timed out. Please try again in a moment.'
                    });
                }
            } catch (replyError) {
                logger.error('Failed to send timeout response:', replyError);
            }
            return;
        }

        // Handle other command errors
        await ErrorHandler.handleDiscordError(error, errorContext, interaction);
    }
}

/**
 * Handles autocomplete interactions
 * @param {import('discord.js').AutocompleteInteraction} interaction 
 * @param {import('discord.js').Client} client 
 */
async function handleAutocomplete(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) {
        logger.warn(`Autocomplete not found for command: ${interaction.commandName}`);
        return;
    }

    try {
        // Autocomplete should be fast - 3 second timeout
        const autocompletePromise = command.autocomplete(interaction);
        await ErrorHandler.withTimeout(
            autocompletePromise,
            3000,
            `autocomplete for ${interaction.commandName}`
        );
    } catch (error) {
        // For autocomplete, we just log the error and let it fail silently
        // to avoid disrupting the user experience
        logger.error(`Autocomplete error for ${interaction.commandName}:`, error);

        try {
            // Try to respond with empty choices
            await interaction.respond([]);
        } catch (respondError) {
            // If we can't even respond with empty choices, just log it
            logger.error('Failed to send empty autocomplete response:', respondError);
        }
    }
}

/**
 * Handles string select menu interactions
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleStringSelectMenu(interaction) {
    try {
        if (interaction.customId.startsWith('webedit_')) {
            await webEditInteractionManager.handleInteraction(interaction);
        } else {
            logger.warn(`Unhandled string select menu: ${interaction.customId}`);
        }
    } catch (error) {
        await ErrorHandler.handleDiscordError(
            error,
            `handling string select menu: ${interaction.customId}`,
            interaction
        );
    }
}

/**
 * Handles button interactions
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleButton(interaction) {
    try {
        const { customId } = interaction;

        if (customId.startsWith('ticket_')) {
            await requestManager.handleInteraction(interaction);
        } else {
            logger.warn(`Unhandled button interaction: ${customId}`);
        }
    } catch (error) {
        await ErrorHandler.handleDiscordError(
            error,
            `handling button interaction: ${interaction.customId}`,
            interaction
        );
    }
}

/**
 * Handles modal submit interactions
 * @param {import('discord.js').ModalSubmitInteraction} interaction 
 */
async function handleModalSubmit(interaction) {
    try {
        const { customId } = interaction;

        if (customId.startsWith('resolve_modal_') || customId === 'request_modal') {
            await requestManager.handleInteraction(interaction);
        } else if (customId.startsWith('sendmail_modal_')) {
            await mailManager.handleModal(interaction);
        } else {
            logger.warn(`Unhandled modal submit: ${customId}`);
        }
    } catch (error) {
        await ErrorHandler.handleDiscordError(
            error,
            `handling modal submit: ${interaction.customId}`,
            interaction
        );
    }
}


