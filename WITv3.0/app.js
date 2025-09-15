const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
require('module-alias/register');
const logger = require('@helpers/logger');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes, MessageFlags } = require('discord.js');
require('dotenv').config();

const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const db = require('@helpers/dbService');
const { startServer } = require('./server.js');

const requestManager = require('@helpers/requestManager');
const mailManager = require('@helpers/mailManager');
const configInteractionManager = require('@helpers/configInteractionManager');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const auditLogger = require('@helpers/auditLogger');

// ================================================================= //
// ==================== DEPLOY COMMANDS SCRIPT ===================== //
// ================================================================= //
async function deployCommands() {
    const commandsToDeploy = [];
    const client = { commands: new Collection() }; // Mock client for command loading
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && ('execute' in command || 'autocomplete' in command)) {
                client.commands.set(command.data.name, command);
                commandsToDeploy.push(command.data.toJSON());
            } else {
                logger.warn(`The command at ${filePath} is missing a required "data", "execute", or "autocomplete" property.`);
            }
        }
    }

    try {
        logger.info(`Started refreshing ${commandsToDeploy.length} application (/) commands.`);
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsToDeploy },
        );
        logger.success(`Successfully reloaded ${data.length} application (/) commands.`);
        console.log(chalk.greenBright('\n✅ Command deployment successful! You can now start the bot normally.'));
    } catch (error) {
        logger.error(error);
    }
}


// ================================================================= //
// =================== MAIN APPLICATION LOGIC ====================== //
// ================================================================= //
async function initializeApp() {
    // Handle command-line flags
    if (process.argv.includes('--db-setup')) {
        logger.info('Running database setup...');
        await db.runSetup();
        process.exit(0);
    }
    if (process.argv.includes('--deploy')) {
        await deployCommands();
        process.exit(0);
    }

    // Ensure database is connected before proceeding
    const dbConnected = await db.ensureDatabaseExistsAndConnected();
    if (!dbConnected) {
        logger.error('Cannot start the application without a database connection. Please check your configuration.');
        return;
    }

    // Load dynamic configurations from the database
    await configManager.reloadConfig();
    await incursionManager.loadIncursionSystems();

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    // In-memory stores
    client.esiStateMap = new Map();
    client.mailSubjects = new Map();
    client.mockOverride = null; // For mock incursion state

    // Start the ESI authentication callback server
    startServer(client);

    // ================================================================= //
    // =================== COMMAND LOADING LOGIC ======================= //
    // ================================================================= //
    client.commands = new Collection();
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && ('execute' in command || 'autocomplete' in command)) {
                client.commands.set(command.data.name, command);
            } else {
                logger.warn(`The command at ${filePath} is missing a required property.`);
            }
        }
    }

    // ================================================================= //
    // ============ STATE MANAGEMENT & HELPER FUNCTIONS ================ //
    // ================================================================= //
    const { updateIncursions } = require('@helpers/incursionUpdater.js');
    client.updateIncursions = (options) => updateIncursions(client, options);

    // ================================================================= //
    // ====================== EVENT LISTENERS ========================== //
    // ================================================================= //
    client.once(Events.ClientReady, c => {
        logger.success(`Ready! Logged in as ${c.user.tag}`);
        client.updateIncursions();
        setInterval(() => client.updateIncursions(), 1 * 60 * 1000);
    });

    client.on(Events.InteractionCreate, async interaction => {
        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;

                await command.execute(interaction);
                await auditLogger.logCommand(interaction);

            } else if (interaction.isAutocomplete()) {
                const command = client.commands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;
                await command.autocomplete(interaction);

            } else if (interaction.isButton()) {
                const { customId } = interaction;
                if (customId.startsWith('ticket_')) {
                    await requestManager.handleInteraction(interaction);
                } else if (customId.startsWith('config_action_')) {
                    await configInteractionManager.handleInteraction(interaction);
                }

            } else if (interaction.isModalSubmit()) {
                const { customId } = interaction;
                if (customId.startsWith('resolve_modal_')) {
                    await requestManager.handleInteraction(interaction);
                } else if (customId.startsWith('sendmail_modal_')) {
                    await mailManager.handleModal(interaction);
                } else if (customId.startsWith('config_modal_')) {
                    await configInteractionManager.handleInteraction(interaction);
                }

            } else if (interaction.isStringSelectMenu()) {
                const { customId } = interaction;
                if (customId.startsWith('config_')) {
                    await configInteractionManager.handleInteraction(interaction);
                }
            }
        } catch (error) {
            logger.error(`Error during interaction:`, error);
            const errorMessage = { content: 'There was an error while processing this interaction!', flags: [MessageFlags.Ephemeral] };
            try {
                if (interaction.isAutocomplete()) {
                    console.error("Failed to respond to an autocomplete interaction.");
                } else if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (followUpError) {
                logger.error('Failed to send error follow-up message:', followUpError);
            }
        }
    });

    client.login(process.env.DISCORD_TOKEN);
}

initializeApp();

