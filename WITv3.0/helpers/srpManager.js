const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const logger = require('@helpers/logger');
const authManager = require('@helpers/authManager');
const charManager = require('@helpers/characterManager');
const configManager = require('@helpers/configManager');

async function handleSrpPart1(interaction) {
    const { client } = interaction;
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
    });
}

async function handleSrpContinue(interaction) {
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

async function handleSrpPart2(interaction) {
    await interaction.update({ content: 'Submitting your SRP request...', components: [] });
    const { client } = interaction;
    const config = configManager.get();

    const part1Data = client.srpData.get(interaction.user.id);
    if (!part1Data) {
        return interaction.followUp({ content: 'Error: Could not find the first part of your SRP data. Please start again.' });
    }

    const authData = await authManager.getUserAuthData(interaction.user.id);
    if (!authData) {
        return interaction.followUp({ content: 'You must authenticate a character with ESI before submitting an SRP request. Please use `/auth login`.' });
    }

    try {
        const accessToken = await authManager.getAccessToken(interaction.user.id);
        if (!accessToken) {
            return interaction.followUp({ content: 'Could not get an access token. Your authentication may have expired. Please try `/auth login` again.' });
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

        const srpChannel = await client.channels.fetch(process.env.SRP_CHANNEL_ID);
        if (srpChannel) {
            const submitterCharData = await charManager.getChars(interaction.user.id);
            const submitterName = submitterCharData ? submitterCharData.main_character : interaction.user.tag;

            let killReportValue = srpData.killmail;
            if (srpData.killmail && (srpData.killmail.startsWith('http://') || srpData.killmail.startsWith('https://'))) {
                killReportValue = `[Link](${srpData.killmail})`;
            }

            let detailsValue = srpData.details || 'None';
            if (detailsValue.length > 1024) {
                detailsValue = detailsValue.substring(0, 1021) + '...';
            }

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
                    { name: 'Details', value: detailsValue, inline: false },
                    { name: 'Submitted On', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
                )
                .setTimestamp();

            await srpChannel.send({ embeds: [srpEmbed] });
        }

        await interaction.followUp({ content: 'Your SRP request has been submitted successfully!' });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error('Failed to send EVE mail:', errorMessage);
        await interaction.followUp({ content: `Failed to send SRP mail. ESI responded with: \`${errorMessage}\`` });
    } finally {
        client.srpData.delete(interaction.user.id);
    }
}

async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'srp_continue') {
            await handleSrpContinue(interaction);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'srp_modal_part1') {
            await handleSrpPart1(interaction);
        } else if (interaction.customId === 'srp_modal_part2') {
            await handleSrpPart2(interaction);
        }
    }
}

module.exports = { handleInteraction };

