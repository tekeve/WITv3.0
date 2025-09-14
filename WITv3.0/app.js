// ================================================================= //
// =================== IMPORTS AND CLIENT SETUP ==================== //
// ================================================================= //
const fs = require('node:fs');
const path = require('node:path');
require('module-alias/register');
const logger = require('@helpers/logger');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes, MessageFlags } = require('discord.js');
require('dotenv').config();
const configManager = require('@helpers/configManager.js');
const incursionManager = require('@helpers/incursionManager.js');
const requestManager = require('@helpers/requestManager.js');
const srpManager = require('@helpers/srpManager.js'); // Import the new SRP manager
const { startServer } = require('./server.js');
const { updateIncursions } = require('@helpers/incursionUpdater.js');
const db = require('@helpers/dbService');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// In-memory stores
client.esiStateMap = new Map();
client.srpData = new Map();
client.mailSubjects = new Map();
client.mockOverride = null;

// Function to ensure the database is ready
async function ensureDatabaseExistsAndConnected() {
    try {
        await db.query('SELECT 1 + 1 AS solution');
        logger.success('Database connection successful!');
        return true;
    } catch (error) {
        logger.error('Database connection failed. Run with --db-setup flag to initialize.');
        return false;
    }
}

// Main application initialization function
async function initializeApp() {
    if (process.argv.includes('--db-setup')) {
        logger.info('Running database setup...');
        await db.runSetup();
        logger.success('Database setup complete. You can now start the application normally.');
        process.exit(0);
    }

    const dbConnected = await ensureDatabaseExistsAndConnected();
    if (!dbConnected) {
        logger.error('Cannot start application without a database connection.');
        return;
    }

    // Load critical data from the database on startup
    await configManager.loadConfig();
    await incursionManager.load();

    startServer(client);

    // ================================================================= //
    // =================== COMMAND LOADING LOGIC ======================= //
    // ================================================================= //
    client.commands = new Collection();
    const commandsToDeploy = [];
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commandsToDeploy.push(command.data.toJSON());
            } else {
                logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    // ================================================================= //
    // ============ STATE MANAGEMENT & HELPER FUNCTIONS ================ //
    // ================================================================= //
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
        // Command Handler
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                logger.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
                }
            }
        }
        // Button Handler
        else if (interaction.isButton()) {
            const { customId } = interaction;
            if (customId === 'ticket_solve' || customId === 'ticket_deny') {
                await requestManager.handleRequestButton(interaction);
            }
            if (customId === 'srp_continue') {
                await srpManager.handleSrpContinueButton(interaction); // Use the SRP manager
            }
        }
        // Modal Handler
        else if (interaction.isModalSubmit()) {
            const { customId } = interaction;

            if (customId.startsWith('resolve_modal_')) {
                await requestManager.handleRequestModal(interaction);
            }
            if (customId === 'srp_modal_part1') {
                await srpManager.handleSrpModalPart1(interaction); // Use the SRP manager
            }
            if (customId === 'srp_modal_part2') {
                await srpManager.handleSrpModalPart2(interaction); // Use the SRP manager
            }
            // ... handler for sendmail_modal will be moved next
        }
    });

    // ================================================================= //
    // ================= DEPLOY COMMANDS & BOT LOGIN =================== //
    // ================================================================= //
    (async () => {
        try {
            logger.info(`Started refreshing ${commandsToDeploy.length} application (/) commands.`);
            const rest = new REST().setToken(process.env.DISCORD_TOKEN);
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commandsToDeploy },
            );
            logger.success(`Successfully reloaded ${data.length} application (/) commands.`);
            client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            logger.error(error);
        }
    })();
}
initializeApp();

