const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
require('module-alias/register');
const logger = require('@helpers/logger');
// --- MODIFICATION START ---
// We are importing Partials and expanding the list of GatewayIntentBits.
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
// --- MODIFICATION END ---
require('dotenv').config();

const configManager = require('@helpers/configManager');
const incursionManager = require('@helpers/incursionManager');
const db = require('@helpers/database');
const { startServer } = require('./web/server.js');
const roleHierarchyManager = require('@helpers/roleHierarchyManager');

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

// ================================================================= //
// =================== MAIN APPLICATION LOGIC ====================== //
// ================================================================= //
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

    // --- MODIFICATION START ---
    // This is the critical change. We are now telling the bot to subscribe to all the
    // events required for the action log to function correctly.
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates
        ],
        partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
    });
    // --- MODIFICATION END ---


    // In-memory stores
    client.activeSrpTokens = new Map();
    client.activeSetupTokens = new Map();
    client.activeWebEditTokens = new Map();
    client.esiStateMap = new Map();
    client.mailSubjects = new Map();
    client.mockOverride = null;

    // Start the ESI authentication callback server
    startServer(client);

    // ... (Command Loading Logic remains the same) ...
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
                logger.warn(`The command at ${filePath} is missing a required "data", "execute", "autocomplete", or "permission" property.`);
            }
        }
    }

    // ================================================================= //
    // ============ STATE MANAGEMENT & HELPER FUNCTIONS ================ //
    // ================================================================= //
    const { updateIncursions } = require('@helpers/incursionController.js');
    client.updateIncursions = (options) => updateIncursions(client, options);

    // ================================================================= //
    // ================= DYNAMIC EVENT HANDLER LOADER ================== //
    // ================================================================= //
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        // Pass the client instance to each event handler
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        logger.info(`Loaded event: ${event.name}`);
    }

    client.login(process.env.DISCORD_TOKEN);
}

initializeApp();

