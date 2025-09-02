// ================================================================= //
// =================== IMPORTS AND CLIENT SETUP ==================== //
// ================================================================= //
const fs = require('node:fs');
const path = require('node:path');
require('module-alias/register');
const logger = require('@helpers/logger');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const dotenv = require('dotenv');
const axios = require('axios');
const config = require('./config.js');
const charManager = require('./helpers/characterManager.js');
const authManager = require('./helpers/authManager.js');
const { startServer } = require('./server.js');
const { updateIncursions } = require('./helpers/incursionUpdater.js');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// In-memory stores
client.esiStateMap = new Map();
client.srpData = new Map();
client.mailSubjects = new Map();

// Start the ESI authentication callback server
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

client.updateIncursions = (isManualRefresh = false) => updateIncursions(client, isManualRefresh);

// ================================================================= //
// ====================== EVENT LISTENERS ========================== //
// ================================================================= //
client.once(Events.ClientReady, c => {
    logger.success(`Ready! Logged in as ${c.user.tag}`);
    client.updateIncursions();
    setInterval(() => client.updateIncursions(), 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
    // Command Handler
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); }
        catch (error) {
            logger.error(error);
            if (interaction.replied || interaction.deferred) { await interaction.followUp({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] }); }
            else { await interaction.reply({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] }); }
        }
    }
    // Button Handler
    else if (interaction.isButton()) {
        const { customId, member } = interaction;
        if (customId === 'ticket_solve' || customId === 'ticket_deny') {
            if (!member.roles.cache.some(role => config.adminRoles.includes(role.name))) {
                return interaction.reply({ content: 'You do not have permission to resolve tickets.', flags: [MessageFlags.Ephemeral] });
            }
            const modal = new ModalBuilder().setTitle('Resolve Request Ticket');
            const action = customId === 'ticket_solve' ? 'Solved' : 'Denied';
            modal.setCustomId(`resolve_modal_${interaction.message.id}_${action}`);
            const commentInput = new TextInputBuilder().setCustomId('resolve_comment').setLabel('Closing Comment').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter your reason...').setRequired(true);
            const actionRow = new ActionRowBuilder().addComponents(commentInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
        if (customId === 'srp_continue') {
            const modal = new ModalBuilder()
                .setCustomId('srp_modal_part2')
                .setTitle('SRP Request (Part 2/2)');

            const srpableInput = new TextInputBuilder().setCustomId('srpable').setLabel('Was the cause of death SRPable?').setStyle(TextInputStyle.Short).setPlaceholder('Yes / No').setRequired(true);
            const paidInput = new TextInputBuilder().setCustomId('paid').setLabel('Did the pilot pay SRP?').setStyle(TextInputStyle.Short).setPlaceholder('Yes / No / First Day / Commander').setRequired(true);
            const lootInput = new TextInputBuilder().setCustomId('loot').setLabel('Loot Recovered?').setStyle(TextInputStyle.Short).setPlaceholder('Yes / No').setRequired(true);
            const detailsInput = new TextInputBuilder().setCustomId('details').setLabel('Details').setStyle(TextInputStyle.Paragraph).setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(srpableInput),
                new ActionRowBuilder().addComponents(paidInput),
                new ActionRowBuilder().addComponents(lootInput),
                new ActionRowBuilder().addComponents(detailsInput)
            );
            await interaction.showModal(modal);
        }
    }
    // Modal Handler
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
                const createdOnField = originalEmbed.fields.find(field => field.name === 'Created On');
                const createdOnValue = createdOnField ? createdOnField.value : 'N/A';
                const resolvedTimestamp = Math.floor(Date.now() / 1000);
                const archiveEmbed = new EmbedBuilder()
                    .setColor(action === 'Solved' ? 0x3BA55D : 0xED4245)
                    .setTitle(`Request ${action}`)
                    .setAuthor(originalEmbed.author)
                    .setDescription(originalEmbed.description)
                    .addFields(
                        { name: 'Status', value: action, inline: true },
                        { name: 'Resolved By', value: resolverName, inline: true },
                        { name: 'Closing Comment', value: closingComment, inline: false },
                        { name: 'Created On', value: createdOnValue, inline: true },
                        { name: 'Resolved On', value: `<t:${resolvedTimestamp}:f>`, inline: true }
                    );
                const archiveChannel = await client.channels.fetch(config.archiveChannelId);
                await archiveChannel.send({ embeds: [archiveEmbed] });
                await originalMessage.delete();
                await interaction.reply({ content: 'The ticket has been successfully archived.', flags: [MessageFlags.Ephemeral] });
            } catch (error) {
                logger.error('Error processing ticket resolution:', error);
                await interaction.reply({ content: 'There was an error resolving this ticket.', flags: [MessageFlags.Ephemeral] });
            }
        }
        if (customId === 'srp_modal_part1') {
            const part1Data = {
                pilot: interaction.fields.getTextInputValue('srp_pilot_name'),
                killmail: interaction.fields.getTextInputValue('srp_kill_report'),
                value: interaction.fields.getTextInputValue('srp_kill_value'),
                fc: interaction.fields.getTextInputValue('srp_fc_name'),
                ship: interaction.fields.getTextInputValue('srp_ship_type'),
            };
            client.srpData.set(interaction.user.id, part1Data);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('srp_continue').setLabel('Continue to Part 2').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({
                content: 'Part 1 submitted. Please continue to the second part of the form.',
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });
        }
        if (customId === 'srp_modal_part2') {
            await interaction.update({ content: 'Submitting your SRP request...', components: [] });

            const part1Data = client.srpData.get(interaction.user.id);
            if (!part1Data) {
                return interaction.followUp({ content: 'Error: Could not find the first part of your SRP data. Please start again.', flags: [MessageFlags.Ephemeral] });
            }

            const authData = authManager.getUserAuthData(interaction.user.id);
            if (!authData) {
                return interaction.followUp({ content: 'You must authenticate a character with the ESI before submitting an SRP request via mail. Please use `/auth login`.', flags: [MessageFlags.Ephemeral] });
            }

            try {
                const accessToken = await authManager.getAccessToken(interaction.user.id);
                if (!accessToken) {
                    return interaction.followUp({ content: 'Could not get an access token. Your authentication may have expired. Please try `/auth login` again.', flags: [MessageFlags.Ephemeral] });
                }

                const srpData = {
                    ...part1Data,
                    srpable: interaction.fields.getTextInputValue('srpable'),
                    paid: interaction.fields.getTextInputValue('paid'),
                    loot: interaction.fields.getTextInputValue('loot'),
                    details: interaction.fields.getTextInputValue('details')
                };

                const subject = `SRP Request - ${srpData.pilot} - ${srpData.ship}`;
                const body = `Pilot Name: ${srpData.pilot}\n`
                    + `Kill Report: ${srpData.killmail}\n`
                    + `Kill Value: ${srpData.value} ISK\n`
                    + `FC: ${srpData.fc}\n`
                    + `Ship Lost: ${srpData.ship}\n\n`
                    + `SRPable: ${srpData.srpable}\n`
                    + `Paid SRP: ${srpData.paid}\n`
                    + `Loot Recovered: ${srpData.loot}\n\n`
                    + `Additional Details:\n${srpData.details || 'None'}`;

                await axios.post(
                    `https://esi.evetech.net/latest/characters/${authData.character_id}/mail/`,
                    {
                        approved_cost: 0,
                        body: body,
                        recipients: [{ recipient_id: config.srpMailingListId, recipient_type: 'mailing_list' }],
                        subject: subject,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                try {
                    const srpChannel = await client.channels.fetch(config.srpChannelId);
                    if (srpChannel) {
                        const submitterCharData = charManager.getChars(interaction.user.id);
                        const submitterName = submitterCharData ? submitterCharData.mainChar : interaction.user.tag;

                        let killReportValue = srpData.killmail;
                        if (srpData.killmail && (srpData.killmail.startsWith('http://') || srpData.killmail.startsWith('https://'))) {
                            killReportValue = `[Link](${srpData.killmail})`;
                        }

                        // <<< START: NEW TRUNCATION LOGIC >>>
                        // Truncate the details field if it's too long for an embed
                        let detailsValue = srpData.details || 'None';
                        if (detailsValue.length > 1024) {
                            detailsValue = detailsValue.substring(0, 1021) + '...';
                        }
                        // <<< END: NEW TRUNCATION LOGIC >>>

                        const srpEmbed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setAuthor({ name: `Submitted by: ${submitterName}`, iconURL: interaction.user.displayAvatarURL() })
                            .setTitle('New SRP Request')
                            .addFields(
                                { name: 'Pilot Name', value: srpData.pilot, inline: true },
                                { name: 'FC Name', value: srpData.fc, inline: true },
                                { name: '\u200B', value: '\u200B', inline: true },
                                { name: 'Ship Lost', value: srpData.ship, inline: true },
                                { name: 'ISK Value', value: srpData.value, inline: true },
                                { name: 'Kill Report', value: killReportValue, inline: true },
                                { name: 'SRPable?', value: srpData.srpable, inline: true },
                                { name: 'SRP Paid?', value: srpData.paid, inline: true },
                                { name: 'Loot Recovered?', value: srpData.loot, inline: true },
                                // Use the potentially truncated details value
                                { name: 'Details', value: detailsValue, inline: false },
                                { name: 'Submitted On', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
                            )
                            .setTimestamp();

                        await srpChannel.send({ embeds: [srpEmbed] });
                    }
                } catch (channelError) {
                    logger.error('Failed to send SRP notification to channel:', channelError);
                }

                await interaction.followUp({ content: 'Your SRP request has been submitted successfully!', flags: [MessageFlags.Ephemeral] });

            } catch (error) {
                const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                logger.error('Failed to send EVE mail:', errorMessage);
                await interaction.followUp({ content: `Failed to send SRP mail. ESI responded with: \`${errorMessage}\``, flags: [MessageFlags.Ephemeral] });
            } finally {
                client.srpData.delete(interaction.user.id);
            }
        }
        if (customId.startsWith('sendmail_modal_')) {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const mailId = customId.substring('sendmail_modal_'.length);
            const mailData = client.mailSubjects.get(mailId);
            if (!mailData) {
                return interaction.editReply({ content: 'Error: Could not retrieve mail data. It might have expired. Please try again.' });
            }

            const mailBody = interaction.fields.getTextInputValue('mail_body');
            const authData = authManager.getUserAuthData(interaction.user.id);

            if (!authData) {
                return interaction.editReply({ content: 'Your authentication has expired. Please `/auth login` again.' });
            }

            try {
                const accessToken = await authManager.getAccessToken(interaction.user.id);
                const recipientId = parseInt(mailData.mailingList, 10);
                if (isNaN(recipientId)) {
                    return interaction.editReply({ content: 'Error: The mailing list ID must be a number.' });
                }

                const recipient = {
                    recipient_id: recipientId,
                    recipient_type: 'mailing_list'
                };

                await axios.post(
                    `https://esi.evetech.net/latest/characters/${authData.character_id}/mail/`,
                    {
                        approved_cost: 0,
                        body: mailBody,
                        recipients: [recipient],
                        subject: mailData.subject,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                await interaction.editReply({ content: 'EVE Mail has been sent successfully!' });
            } catch (error) {
                const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                logger.error('Failed to send EVE mail:', errorMessage);
                await interaction.editReply({ content: `Failed to send EVE mail. ESI responded with: \`${errorMessage}\`` });
            } finally {
                client.mailSubjects.delete(mailId);
            }
        }
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
