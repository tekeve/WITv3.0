const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
require('module-alias/register');
const logger = require('@helpers/logger');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const db = require('@helpers/database');
const { startServer } = require('./web/server.js');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');
const reactionRoleManager = require('@helpers/reactionRoleManager');

// ... (deployCommands function remains the same) ...
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

async function initializeApp() {
    if (process.argv.includes('--db-setup')) {
        logger.info('Running database setup...');
        await db.runSetup();
        process.exit(0);
    }
    if (process.argv.includes('--deploy')) {
        await deployCommands();
        process.exit(0);
    }

    const dbConnected = await db.ensureDatabaseExistsAndConnected();
    if (!dbConnected) {
        logger.error('Cannot start the application without a database connection.');
        return;
    }

    await configManager.reloadConfig();
    await incursionManager.loadIncursionSystems();
    await roleHierarchyManager.reloadHierarchy();
    await reactionRoleManager.loadReactionRoles(); // Load reaction roles on startup

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildMessageReactions, // Added for reaction roles
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.GuildMember,
            Partials.Reaction, // Added for reaction roles
            Partials.User      // Added for reaction roles
        ],
    });

    client.activeSrpTokens = new Map();
    client.activeSetupTokens = new Map();
    client.activeWebEditTokens = new Map();
    client.activeResidentAppTokens = new Map();
    client.activeEmbedTokens = new Map();
    client.activeReactionRoleTokens = new Map(); // Added for reaction roles
    client.esiStateMap = new Map();
    client.mailSubjects = new Map();
    client.mockOverride = null;

    startServer(client);

    client.commands = new Collection();
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && ('execute' in command || 'autocomplete' in command) && 'permission' in command) {
                client.commands.set(command.data.name, command);
            } else {
                logger.warn(`The command at ${filePath} is missing a required property.`);
            }
        }
    }

    const { updateIncursions } = require('@helpers/incursionController.js');
    client.updateIncursions = (options) => updateIncursions(client, options);

    // --- CONSOLIDATED EVENT HANDLER LOADING ---
    const clientReadyHandler = require('./events/clientReady');
    const interactionCreateHandler = require('./events/interactionCreate');
    const srpSubmissionHandler = require('./events/srpSubmission');
    const residentAppSubmissionHandler = require('./events/residentAppSubmission');
    const { registerActionLogEvents } = require('./events/actionLogHandler');
    const { registerReactionEvents } = require('./events/reactionHandler'); // Added for reaction roles

    client.once(clientReadyHandler.name, (...args) => clientReadyHandler.execute(...args, client));
    client.on(interactionCreateHandler.name, (...args) => interactionCreateHandler.execute(...args, client));
    client.on(srpSubmissionHandler.name, (...args) => srpSubmissionHandler.execute(...args, client));
    client.on(residentAppSubmissionHandler.name, (...args) => residentAppSubmissionHandler.execute(...args, client));

    // Register all action log event listeners
    registerActionLogEvents(client);
    // Register reaction role event listeners
    registerReactionEvents(client);


    logger.info('Loaded all event handlers.');
    // --- END OF NEW LOADING LOGIC ---

    client.login(process.env.DISCORD_TOKEN);
}

initializeApp();
