require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
require('module-alias/register');

const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { services, initializeServices } = require('@services/index.js');

// Init Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.Reaction,
        Partials.User
    ],
});

client.command = new Collection();

/**
 * Loads all enabled plugins from the plugins directory.
 * @param {object} services - The core services to pass to each plugin.
 */
function loadPlugins(services) {
    const pluginsConfigPath = path.join(__dirname, 'plugins', 'plugins.json');
    let pluginConfigs;

    try {
        const configFile = fs.readFileSync(pluginsConfigPath, 'utf8');
        pluginConfigs = JSON.parse(configFile);
    } catch (error) {
        services.logger.error(`Failed to read plugins.json: ${error.message}`);
        return;
    }

    services.logger.info('Loading plugins...');

    for (const plugin of pluginConfigs) {
        if (plugin.enabled) {
            const pluginPath = path.join(__dirname, 'plugins', plugin.directory);
            try {
                const pluginMainFile = path.join(pluginPath, 'index.js');
                if (!fs.existsSync(pluginMainFile)) {
                    services.logger.warn(`Plugin "${plugin.name}" is enabled but ${pluginMainFile} was not found.`);
                    continue;
                }

                const pluginModule = require(pluginMainFile);

                if (typeof pluginModule.initialize === 'function') {
                    // Initialize the plugin, passing in all core services
                    pluginModule.initialize(services);
                    services.logger.info(`Successfully loaded plugin: ${plugin.name}`);
                } else {
                    services.logger.warn(`Plugin "${plugin.name}" does not have an 'initialize' function.`);
                }

            } catch (error) {
                services.logger.error(`Failed to load plugin "${plugin.name}": ${error.message}`);
                console.error(error); // Log the full stack trace
            }
        } else {
            services.logger.info(`Skipping disabled plugin: ${plugin.name}`);
        }
    }
}

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

    const dbConnected = await db.ensureDatabaseExistsAndConnected();
    if (!dbConnected) {
        logger.error('Cannot start the application without a database connection.');
        return;
    }

    await configManager.reloadConfig();
    await incursionManager.loadIncursionSystems();
    await roleHierarchyManager.reloadHierarchy();
    await reactionRoleManager.loadReactionRoles(); // Load reaction roles on startup


    client.activeSrpTokens = new Map();
    client.activeSetupTokens = new Map();
    client.activeWebEditTokens = new Map();
    client.activeResidentAppTokens = new Map();
    client.activeEmbedTokens = new Map();
    client.activeReactionRoleTokens = new Map();
    client.activeTrainingTokens = new Map();
    client.activeQuizTokens = new Map(); // Added for the new quiz system
    client.activeIskTokens = new Map();
    client.activeLogAnalysisTokens = new Map();
    client.activeWalletTokens = new Map(); // Add map for wallet monitor tokens
    client.esiStateMap = new Map();
    client.mailSubjects = new Map();
    client.mockOverride = null;

    startServer(client);
}
/**
 * Main function to start the bot
 */
async function startBot() {
    try {

        if (process.argv.includes('--db-setup')) {
            logger.info('Running database setup...');
            await services.db.runSetup();
            process.exit(0);
        }
        if (process.argv.includes('--deploy')) {
            await deployCommands();
            process.exit(0);
        }

        // 1. Initialize Core Services (DB, Config, etc.)
        await initializeServices();

        // 2. Add the Discord client to the services object
        // This makes it available to all plugins
        services.client = client;

        // 3. Load all plugins
        // Plugins will now register all commands, events, and start the web server.
        loadPlugins(services);

        // 4. Login to Discord
        services.logger.info('Logging in to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
        services.logger.info('Bot is logged in and ready.');

    } catch (error) {
        console.error(`Error during bot startup: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

startBot();

