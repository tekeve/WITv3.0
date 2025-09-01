const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const axios = require('axios');
const config = require('./config.js');
const charManager = require('./helpers/characterManager.js');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ================================================================= //
// =================== COMMAND LOADING LOGIC ======================= //
// ================================================================= //

client.commands = new Collection();
const commandsToDeploy = []; // A new array to hold command data for deployment
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            // Store the command's execution logic
            client.commands.set(command.data.name, command);
            // Store the command's JSON data for deployment
            commandsToDeploy.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}


// ================================================================= //
// ============== DEPLOY COMMANDS & STARTUP SEQUENCE =============== //
// ================================================================= //

// This is an immediately invoked async function that handles deployment and login
(async () => {
    try {
        console.log(`Started refreshing ${commandsToDeploy.length} application (/) commands.`);

        // The REST module is required for interacting with Discord's API
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsToDeploy },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);

        // After deploying commands, log the client in
        client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        console.error(error);
    }
})();


// ================================================================= //
// =================== EVENT LISTENERS BELOW ======================= //
// ================================================================= //

// --- ClientReady Event Listener (This now runs after login) ---
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);

    // Start the incursion checker
    client.updateIncursions();

    // The interval timer
    setInterval(() => client.updateIncursions(), 5 * 60 * 1000);
});

// --- InteractionCreate Event Listener (No changes here) ---
client.on(Events.InteractionCreate, async interaction => {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    }
    // Handle Button Interactions
    else if (interaction.isButton()) {
        const { customId, member } = interaction;

        // Check if the button is for our ticket system
        if (customId === 'ticket_solve' || customId === 'ticket_deny') {
            // Check if the user has an admin role
            if (!member.roles.cache.some(role => config.adminRoles.includes(role.name))) {
                return interaction.reply({ content: 'You do not have permission to resolve tickets.', ephemeral: true });
            }

            // Create the pop-up modal for the closing comment
            const modal = new ModalBuilder()
                .setTitle('Resolve Request Ticket');

            // Embed the original message ID and the action (solve/deny) in the modal's ID
            const action = customId === 'ticket_solve' ? 'Solved' : 'Denied';
            modal.setCustomId(`resolve_modal_${interaction.message.id}_${action}`);

            const commentInput = new TextInputBuilder()
                .setCustomId('resolve_comment')
                .setLabel('Closing Comment')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter your reason for solving or denying this request.')
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(commentInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }
    }
    // Handle Modal (Pop-up Form) Submissions
    else if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId.startsWith('resolve_modal_')) {
            const [, , messageId, action] = customId.split('_');
            const closingComment = interaction.fields.getTextInputValue('resolve_comment');

            try {
                // --- NEW LOGIC START ---
                // Look up the main character name of the person resolving the ticket
                const resolverCharData = charManager.getChars(interaction.user.id);
                // Use their character name if found, otherwise default to their Discord tag
                const resolverName = resolverCharData ? resolverCharData.mainChar : interaction.user.tag;
                // --- NEW LOGIC END ---

                const requestChannel = await client.channels.fetch(config.requestChannelId);
                const originalMessage = await requestChannel.messages.fetch(messageId);
                const originalEmbed = originalMessage.embeds[0];

                const archiveEmbed = new EmbedBuilder()
                    .setColor(action === 'Solved' ? 0x3BA55D : 0xED4245)
                    .setTitle(`Request ${action}`)
                    .setAuthor(originalEmbed.author)
                    .setDescription(originalEmbed.description)
                    .addFields(
                        { name: 'Status', value: action, inline: true },
                        // --- MODIFIED LINE ---
                        { name: 'Resolved By', value: resolverName, inline: true },
                        { name: 'Closing Comment', value: closingComment }
                    )
                    .setTimestamp();

                const archiveChannel = await client.channels.fetch(config.archiveChannelId);
                await archiveChannel.send({ embeds: [archiveEmbed] });

                await originalMessage.delete();

                await interaction.reply({ content: 'The ticket has been successfully archived.', ephemeral: true });

            } catch (error) {
                console.error('Error processing ticket resolution:', error);
                await interaction.reply({ content: 'There was an error resolving this ticket. It might have been deleted already.', ephemeral: true });
            }
        }
    }
});


// ================================================================= //
// ============== INCURSION & STATE LOGIC BELOW ==================== //
// ================================================================= //

// ... (imports and other setup)

const STATE_FILE = path.join(__dirname, 'state.json');

// --- MODIFIED: Load initial state, now including the ID cache ---
let { lastIncursionState, incursionMessageId, idCacheData } = (() => {
    try {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('State file not found or invalid, starting with a fresh state.');
        return { lastIncursionState: '', incursionMessageId: null, idCacheData: {} };
    }
})();

let isUpdating = false; // Add this new line

// --- MODIFIED: Initialize the cache from the loaded data ---
// We convert the plain object from the JSON file back into a Map
const idCache = new Map(Object.entries(idCacheData || {}));

// --- MODIFIED: Function to save the current state, including the cache ---
function saveState() {
    const state = {
        lastIncursionState,
        incursionMessageId,
        // Convert the Map to a plain object for JSON compatibility
        idCacheData: Object.fromEntries(idCache),
    };
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Failed to save state to file:', error);
    }
}

// ... (factionMap constant)

const factionMap = {
    500019: 'Sansha\'s Nation',
    500020: 'Triglavian Collective',
};

// --- NEW: Helper function to resolve IDs to names from ESI ---
async function resolveIdToName(id, type) {
    if (idCache.has(id)) {
        return idCache.get(id);
    }

    let url;
    if (type === 'system') {
        url = `https://esi.evetech.net/latest/universe/systems/${id}/`;
    } else if (type === 'constellation') {
        url = `https://esi.evetech.net/latest/universe/constellations/${id}/`;
    } else {
        return 'Unknown Type';
    }

    try {
        const response = await axios.get(url);
        const name = response.data.name;

        idCache.set(id, name);
        saveState(); // --- ADDED: Save the state whenever a new name is cached ---
        return name;
    } catch (error) {
        console.error(`Failed to resolve ID ${id} for type ${type}:`, error.message);
        idCache.set(id, `ID ${id}`);
        saveState(); // --- ADDED: Also save on failure to prevent spamming the API ---
        return `ID ${id}`;
    }
}

client.updateIncursions = async function (isManualRefresh = false) {
    // --- NEW: Check if an update is already in progress ---
    if (isUpdating) {
        console.log('Update already in progress. Skipping.');
        return;
    }

    // --- NEW: Set the lock ---
    isUpdating = true;

    // --- NEW: Use a try...finally block to ensure the lock is always released ---
    try {
        console.log('Checking for incursion updates...');
        const response = await axios.get('https://esi.evetech.net/latest/incursions/');
        const incursions = response.data;

        const currentState = incursions.map(inc => `${inc.constellation_id}-${inc.state}`).sort().join(',');

        if (currentState === lastIncursionState && !isManualRefresh) {
            console.log('No change in incursion state.');
            // We still need to return from inside the try block
            return;
        }

        console.log('Incursion state has changed or manual refresh triggered. Updating...');
        lastIncursionState = currentState;
        saveState();

        const embeds = [];
        if (incursions.length === 0) {
            // ... (no changes inside this block)
        } else {
            const enrichedIncursions = await Promise.all(incursions.map(async (incursion) => {
                const constellationName = await resolveIdToName(incursion.constellation_id, 'constellation');
                const systemName = await resolveIdToName(incursion.staging_solar_system_id, 'system');
                return { ...incursion, constellationName, systemName };
            }));

            for (const incursion of enrichedIncursions) {
                // ... (no changes to the embed builder)
            }
        }

        const channel = await client.channels.fetch(config.incursionChannelId);
        if (!channel) {
            console.error(`Error: Channel with ID ${config.incursionChannelId} not found.`);
            return;
        }

        if (incursionMessageId) {
            // ... (no changes inside this block)
        } else {
            // ... (no changes inside this block)
        }

    } catch (error) {
        console.error('Failed to fetch or process incursion data. Full error:', error);
    } finally {
        // --- NEW: Release the lock after the function is done ---
        isUpdating = false;
        console.log('Update check finished.');
    }
};

// Login to Discord (no changes here)
client.login(process.env.DISCORD_TOKEN);