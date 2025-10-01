const logger = require('@helpers/logger');

/**
 * Centralized error handling utility for Discord bot operations
 */
class ErrorHandler {
    /**
     * Handles Discord API errors with appropriate responses and logging
     * @param {Error} error - The error that occurred
     * @param {string} context - Description of what was being attempted
     * @param {import('discord.js').Interaction} [interaction] - Optional interaction to respond to
     * @returns {Object} - Standardized error response
     */
    static async handleDiscordError(error, context, interaction = null) {
        const errorInfo = {
            userMessage: 'An unexpected error occurred.',
            shouldRetry: false,
            isPermissionError: false,
            isCritical: false
        };

        // Handle specific Discord API errors
        switch (error.code) {
            case 50013: // Missing Permissions
                errorInfo.userMessage = 'The bot lacks the necessary permissions to perform this action.';
                errorInfo.isPermissionError = true;
                logger.error(`Permission error in ${context}: ${error.message}`);
                break;

            case 50001: // Missing Access
                errorInfo.userMessage = 'The bot cannot access the required resource.';
                errorInfo.isPermissionError = true;
                logger.error(`Access error in ${context}: ${error.message}`);
                break;

            case 50035: // Invalid Form Body
                errorInfo.userMessage = 'Invalid data provided. Please check your input and try again.';
                logger.error(`Validation error in ${context}: ${error.message}`);
                break;

            case 10008: // Unknown Message
                errorInfo.userMessage = 'The message no longer exists.';
                logger.warn(`Message not found in ${context}: ${error.message}`);
                break;

            case 10007: // Unknown Member
                errorInfo.userMessage = 'The member is no longer in the server.';
                logger.warn(`Member not found in ${context}: ${error.message}`);
                break;

            case 10011: // Unknown Role
                errorInfo.userMessage = 'The role no longer exists.';
                logger.warn(`Role not found in ${context}: ${error.message}`);
                break;

            case 50033: // Invalid Recipients
                errorInfo.userMessage = 'Unable to send direct message to user. They may have DMs disabled.';
                logger.info(`DM failed in ${context}: ${error.message}`);
                break;

            case 429: // Rate Limited
                errorInfo.userMessage = 'Bot is being rate limited. Please try again in a moment.';
                errorInfo.shouldRetry = true;
                logger.warn(`Rate limited in ${context}: ${error.message}`);
                break;

            case 50016: // Cannot execute action on DM channel
                errorInfo.userMessage = 'This action cannot be performed in direct messages.';
                logger.info(`DM action blocked in ${context}: ${error.message}`);
                break;

            case 50019: // Cannot execute action on system message
                errorInfo.userMessage = 'Cannot perform this action on a system message.';
                logger.info(`System message action blocked in ${context}: ${error.message}`);
                break;

            case 50021: // Cannot execute action on this channel type
                errorInfo.userMessage = 'This action is not supported in this type of channel.';
                logger.info(`Channel type restriction in ${context}: ${error.message}`);
                break;

            case 50025: // Invalid OAuth2 access token
                errorInfo.userMessage = 'Bot authentication error. Please contact an administrator.';
                errorInfo.isCritical = true;
                logger.error(`OAuth2 error in ${context}: ${error.message}`);
                break;

            // Custom error for audit log operations
            case 'AUDIT_LOG_NOT_FOUND':
                // Don't show user message for this - it's internal
                errorInfo.userMessage = null;
                // Use logger.info instead of logger.debug for compatibility
                logger.info(`Audit log entry not found in ${context}`);
                break;

            default:
                errorInfo.userMessage = 'An unexpected error occurred. The issue has been logged.';
                errorInfo.isCritical = true;
                logger.error(`Unexpected error in ${context}:`, error);
        }

        // Auto-respond to interaction if provided and we have a user message
        if (interaction && errorInfo.userMessage) {
            await this.respondToInteraction(interaction, errorInfo.userMessage);
        }

        return errorInfo;
    }

    /**
     * Safely responds to Discord interactions with error messages
     * @param {import('discord.js').Interaction} interaction 
     * @param {string} message 
     */
    static async respondToInteraction(interaction, message) {
        try {
            const responseContent = {
                content: `⚠️ ${message}`,
                ephemeral: true
            };

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(responseContent);
            } else if (interaction.deferred) {
                await interaction.editReply(responseContent);
            } else {
                await interaction.followUp(responseContent);
            }
        } catch (replyError) {
            logger.error('Failed to send error response to interaction:', replyError);
        }
    }

    /**
     * Enhanced retry function with exponential backoff and smart error handling
     * @param {Function} asyncFunction - The async function to retry
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} baseDelay - Base delay in milliseconds
     * @param {string} context - Description for logging
     * @param {Object} options - Additional options
     * @returns {Promise<any>} - Result of the async function or null if appropriate
     */
    static async retry(asyncFunction, maxRetries = 3, baseDelay = 1000, context = 'unknown operation', options = {}) {
        const {
            allowNull = false,           // Whether to return null on final failure
            retryOnPermissionError = false  // Whether to retry on permission errors
        } = options;

        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const result = await asyncFunction();

                // Log success if this wasn't the first attempt
                if (attempt > 0) {
                    logger.info(`${context} succeeded on attempt ${attempt + 1}/${maxRetries}`);
                }

                return result;
            } catch (error) {
                lastError = error;

                // Don't retry on permission errors unless explicitly allowed
                if ((error.code === 50013 || error.code === 50001) && !retryOnPermissionError) {
                    logger.warn(`Permission denied for ${context}. Not retrying.`);
                    if (allowNull) return null;
                    throw error;
                }

                // Handle our custom audit log "not found" error
                if (error.code === 'AUDIT_LOG_NOT_FOUND') {
                    if (attempt === maxRetries - 1) {
                        // Use logger.info instead of logger.debug for compatibility
                        logger.info(`${context} completed after ${maxRetries} attempts - no matching entry found`);
                        return null; // Always return null for audit log not found
                    }
                    // Continue retrying for audit logs
                }

                // Calculate delay with exponential backoff
                if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    const jitter = Math.random() * 100; // Add small random jitter
                    const totalDelay = Math.min(delay + jitter, 10000); // Cap at 10 seconds

                    logger.info(`Retrying ${context} in ${Math.round(totalDelay)}ms... (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, totalDelay));
                } else {
                    // Final attempt failed
                    if (context.includes('audit log') || allowNull) {
                        logger.info(`${context} failed after ${maxRetries} attempts - continuing without result`);
                        return null;
                    }
                }
            }
        }

        // If we get here, all attempts failed
        logger.error(`Failed ${context} after ${maxRetries} attempts`);
        if (allowNull) return null;
        throw lastError;
    }

    /**
     * Wraps async functions with automatic error handling
     * @param {Function} asyncFunction 
     * @param {string} context 
     * @param {import('discord.js').Interaction} [interaction] 
     * @returns {Function}
     */
    static wrapAsync(asyncFunction, context, interaction = null) {
        return async (...args) => {
            try {
                return await asyncFunction(...args);
            } catch (error) {
                const errorInfo = await ErrorHandler.handleDiscordError(error, context, interaction);
                return { error: errorInfo };
            }
        };
    }

    /**
     * Creates a promise that times out after specified milliseconds
     * @param {Promise} promise 
     * @param {number} timeoutMs 
     * @param {string} context 
     * @returns {Promise}
     */
    static withTimeout(promise, timeoutMs = 30000, context = 'operation') {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${context} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        return Promise.race([promise, timeout]);
    }
}

module.exports = ErrorHandler;