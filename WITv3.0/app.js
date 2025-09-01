// ================================================================= //
// =================== IMPORTS AND CLIENT SETUP ==================== //
// ================================================================= //
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const dotenv = require('dotenv');
const axios = require('axios');
const config = require('./config.js');
const charManager = require('./helpers/characterManager.js');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// ================================================================= //
// ============ STATE MANAGEMENT & HELPER FUNCTIONS ================ //
// ================================================================= //
const STATE_FILE = path.join(__dirname, 'state.json');

// MODIFIED: This no longer loads or manages idCacheData.
let {
    lastIncursionState = '',
    incursionMessageId = null,
    lastHqSystemId = null
} = (() => {
    try {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('State file not found or invalid, creating a fresh state.');
        return { lastIncursionState: '', incursionMessageId: null, lastHqSystemId: null };
    }
})();

let isUpdating = false;
const factionMap = { 500019: 'Sansha\'s Nation', 500020: 'Triglavian Collective' };
const incursionSystems = require('./helpers/incursionsystem.json');

// MODIFIED: This no longer saves idCacheData.
function saveState() {
    const state = { lastIncursionState, incursionMessageId, lastHqSystemId };
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Failed to save state to file:', error);
    }
}

// FINALLY, define the main function that uses all the helpers
client.updateIncursions = async function (isManualRefresh = false) {
    if (isUpdating) { return; }
    isUpdating = true;
    try {
        console.log('Checking for incursion updates...');
        const response = await axios.get('https://esi.evetech.net/latest/incursions/', { timeout: 5000 });
        const allIncursions = response.data;

        // Helper function to get system data for the security status check
        const getSystemData = async (systemId) => {
            try {
                const sysResponse = await axios.get(`https://esi.evetech.net/latest/universe/systems/${systemId}/`, { timeout: 5000 });
                return sysResponse.data;
            } catch (e) {
                console.error(`Could not resolve system ID ${systemId}:`, e.message);
                return null;
            }
        };

        // Fetch system data for all active incursions to check their security status
        const enrichedIncursions = await Promise.all(allIncursions.map(async (incursion) => {
            const systemData = await getSystemData(incursion.staging_solar_system_id);
            return { ...incursion, systemData };
        }));

        // Reliably find the high-sec incursion by checking the live security status
        const highSecIncursion = enrichedIncursions.find(inc => inc.systemData && inc.systemData.security_status >= 0.5);

        const currentState = highSecIncursion ? `${highSecIncursion.constellation_id}-${highSecIncursion.state}` : 'none';

        if (currentState === lastIncursionState && !isManualRefresh) {
            console.log('No change in high-sec incursion state.');
            return;
        }

        console.log('High-sec incursion state has changed or manual refresh triggered. Updating...');
        lastIncursionState = currentState;

        let embed;
        if (highSecIncursion) {
            // Find the matching constellation in our incursionsystem.json data using the correct key
            const spawnData = incursionSystems.find(constellation => constellation['ConstellationID'] === highSecIncursion.constellation_id);

            if (!spawnData) {
                console.log(`No matching spawn data found for Constellation ID: ${highSecIncursion.constellation_id}`);
                return;
            }

            const currentHqId = spawnData['Dock Up System ID'];
            const currentHqName = spawnData['Headquarter System'].split(' ')[0]; // Get just the name, e.g., "Orduin"
            let lastHqRouteString = '';

            // Calculate route from the previous HQ if a new spawn is detected
            if (lastHqSystemId && lastHqSystemId !== currentHqId) {
                const lastHqNameData = incursionSystems.find(sys => sys['Dock Up System ID'] === lastHqSystemId);
                const lastHqName = lastHqNameData ? lastHqNameData['Headquarter System'].split(' ')[0] : 'Last HQ';
                try {
                    // Create Gatecheck URLs with names
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${currentHqName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${lastHqName}:${currentHqName}:shortest`;

                    // ESI URLs for fetching jump counts
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=secure`;
                    const shortestEsiUrl = `https://esi.evetech.net/v1/route/${lastHqSystemId}/${currentHqId}/?flag=shortest`;

                    const [secureResponse, shortestResponse] = await Promise.all([
                        axios.get(secureEsiUrl, { timeout: 5000 }),
                        axios.get(shortestEsiUrl, { timeout: 5000 })
                    ]);

                    const secureJumps = secureResponse.data.length - 1;
                    const shortestJumps = shortestResponse.data.length - 1;

                    if (secureJumps === shortestJumps) {
                        lastHqRouteString = `**From ${lastHqName}**: [${shortestJumps} jumps](${shortestGatecheckUrl})`;
                    } else {
                        lastHqRouteString = `**From ${lastHqName}**: [${secureJumps}j (secure)](${secureGatecheckUrl}), [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                    }
                } catch (e) {
                    console.error('Failed to calculate route from last HQ:', e.message);
                    lastHqRouteString = `**From ${lastHqName}**: N/A`;
                }
            }
            lastHqSystemId = currentHqId;

            // Calculate jumps to trade hubs
            const jumpPromises = Object.entries(config.tradeHubs).map(async ([name, id]) => {
                const originId = currentHqId;
                const destinationId = id;
                const originName = currentHqName;
                const destinationName = name;

                try {
                    // Create Gatecheck URLs with names
                    const secureGatecheckUrl = `https://eve-gatecheck.space/eve/#${originName}:${destinationName}:secure`;
                    const shortestGatecheckUrl = `https://eve-gatecheck.space/eve/#${originName}:${destinationName}:shortest`;

                    // ESI URLs for fetching jump counts
                    const secureEsiUrl = `https://esi.evetech.net/v1/route/${originId}/${destinationId}/?flag=secure`;
                    const shortestEsiUrl = `https://esi.evetech.net/v1/route/${originId}/${destinationId}/?flag=shortest`;

                    const [secureResponse, shortestResponse] = await Promise.all([
                        axios.get(secureEsiUrl, { timeout: 5000 }),
                        axios.get(shortestEsiUrl, { timeout: 5000 })
                    ]);

                    const secureJumps = secureResponse.data.length - 1;
                    const shortestJumps = shortestResponse.data.length - 1;
                    if (secureJumps === shortestJumps) {
                        return `**${name}**: [${shortestJumps} jumps](${shortestGatecheckUrl})`;
                    } else {
                        return `**${name}**: [${secureJumps}j (secure)](${secureGatecheckUrl}), [${shortestJumps}j (shortest)](${shortestGatecheckUrl})`;
                    }
                } catch (e) {
                    return `**${name}**: N/A`;
                }
            });
            const jumpCounts = await Promise.all(jumpPromises);

            embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle(`High-Sec Incursion Active: ${factionMap[highSecIncursion.faction_id] || 'Unknown Faction'}`)
                .setThumbnail(`https://images.evetech.net/corporations/${highSecIncursion.faction_id === 500019 ? 1000179 : 1000182}/logo?size=64`)
                .addFields(
                    { name: 'Region', value: spawnData.REGION, inline: true },
                    { name: 'Constellation', value: spawnData.Constellation, inline: true },
                    { name: 'State', value: `\`${highSecIncursion.state.charAt(0).toUpperCase() + highSecIncursion.state.slice(1)}\``, inline: true },
                    { name: 'Headquarters', value: spawnData['Headquarter System'], inline: false },
                    { name: 'Vanguard Systems', value: spawnData['Vanguard Systems'] || 'None', inline: false },
                    { name: 'Assault Systems', value: spawnData['Assault Systems'] || 'None', inline: false },
                    { name: 'Suggested Dockup', value: spawnData.Dockup, inline: false },
                    ...(lastHqRouteString ? [{ name: 'Jumps from Last HQ', value: lastHqRouteString, inline: false }] : []),
                    { name: 'Jumps from HQ', value: jumpCounts.join('\n'), inline: false }
                ).setTimestamp();
        } else {
            embed = new EmbedBuilder().setColor(0x3BA55D).setTitle('No High-Sec Incursion Active').setDescription('The High-Security incursion is not currently active. Fly safe!').setTimestamp();
        }

        saveState();

        const channel = await client.channels.fetch(config.incursionChannelId);
        if (!channel) { return; }
        const messagePayload = { content: ' ', embeds: [embed] };
        if (incursionMessageId) {
            try {
                const message = await channel.messages.fetch(incursionMessageId);
                await message.edit(messagePayload);
            }
            catch (error) {
                console.log('Previous message not found, posting a new one.');
                const newMessage = await channel.send(messagePayload);
                incursionMessageId = newMessage.id;
                saveState();
            }
        } else {
            const newMessage = await channel.send(messagePayload);
            incursionMessageId = newMessage.id;
            saveState();
        }
    } catch (error) {
        console.error('Failed to fetch or process incursion data. Full error:', error);
    } finally {
        isUpdating = false;
        console.log('Update check finished.');
    }
};

// ================================================================= //
// ====================== EVENT LISTENERS ========================== //
// ================================================================= //
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    client.updateIncursions();
    setInterval(() => client.updateIncursions(), 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); }
        catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) { await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true }); }
            else { await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true }); }
        }
    }
    else if (interaction.isButton()) {
        const { customId, member } = interaction;
        if (customId === 'ticket_solve' || customId === 'ticket_deny') {
            if (!member.roles.cache.some(role => config.adminRoles.includes(role.name))) {
                return interaction.reply({ content: 'You do not have permission to resolve tickets.', ephemeral: true });
            }
            const modal = new ModalBuilder().setTitle('Resolve Request Ticket');
            const action = customId === 'ticket_solve' ? 'Solved' : 'Denied';
            modal.setCustomId(`resolve_modal_${interaction.message.id}_${action}`);
            const commentInput = new TextInputBuilder().setCustomId('resolve_comment').setLabel('Closing Comment').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter your reason...').setRequired(true);
            const actionRow = new ActionRowBuilder().addComponents(commentInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
    }
    else if (interaction.isModalSubmit()) {
        const { customId } = interaction;
        if (customId.startsWith('resolve_modal_')) {
            const [, , messageId, action] = customId.split('_');
            const closingComment = interaction.fields.getTextInputValue('resolve_comment');
            try {
                const resolverCharData = charManager.getChars(interaction.user.id);
                const resolverName = resolverCharData ? resolverCharData.mainChar : interaction.user.tag;
                const requestChannel = await client.channels.fetch(config.requestChannelId);
                const originalMessage = await requestChannel.messages.fetch(messageId);
                const originalEmbed = originalMessage.embeds[0];

                // --- NEW LOGIC START ---
                // Find the original creation timestamp from the old embed
                const createdOnField = originalEmbed.fields.find(field => field.name === 'Created On');
                const createdOnValue = createdOnField ? createdOnField.value : 'N/A';

                // Get the current time for the "Resolved On" timestamp
                const resolvedTimestamp = Math.floor(Date.now() / 1000);
                // --- NEW LOGIC END ---

                const archiveEmbed = new EmbedBuilder()
                    .setColor(action === 'Solved' ? 0x3BA55D : 0xED4245)
                    .setTitle(`Request ${action}`)
                    .setAuthor(originalEmbed.author)
                    .setDescription(originalEmbed.description)
                    .addFields(
                        { name: 'Status', value: action, inline: true },
                        { name: 'Resolved By', value: resolverName, inline: true },
                        { name: 'Closing Comment', value: closingComment, inline: false },
                        // Add the new timestamp fields
                        { name: 'Created On', value: createdOnValue, inline: true },
                        { name: 'Resolved On', value: `<t:${resolvedTimestamp}:f>`, inline: true }
                    );

                const archiveChannel = await client.channels.fetch(config.archiveChannelId);
                await archiveChannel.send({ embeds: [archiveEmbed] });
                await originalMessage.delete();
                await interaction.reply({ content: 'The ticket has been successfully archived.', ephemeral: true });
            } catch (error) {
                console.error('Error processing ticket resolution:', error);
                await interaction.reply({ content: 'There was an error resolving this ticket.', ephemeral: true });
            }
        }
    }
});

// ================================================================= //
// ================= DEPLOY COMMANDS & BOT LOGIN =================== //
// ================================================================= //
(async () => {
    try {
        console.log(`Started refreshing ${commandsToDeploy.length} application (/) commands.`);
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsToDeploy },
        );
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error(error);
    }
})();