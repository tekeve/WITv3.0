const logger = require('@helpers/logger');
const db = require('@helpers/database');
const { ChannelType } = require('discord.js');
const actionLogHelper = require('@helpers/actionLog');

/**
 * Fetches the current action log settings from the database.
 * @returns {Promise<object>} The settings object.
 */
async function getSettings() {
    try {
        const rows = await db.query('SELECT * FROM action_log_settings WHERE id = 1');
        if (rows.length > 0) {
            // Parse JSON fields
            const settings = rows[0];
            settings.ignored_channels = settings.ignored_channels ? JSON.parse(settings.ignored_channels) : [];
            settings.ignored_roles = settings.ignored_roles ? JSON.parse(settings.ignored_roles) : [];
            return settings;
        }
        // Return default settings if none are found
        return { id: 1, ignored_channels: [], ignored_roles: [] };
    } catch (error) {
        logger.error('Failed to fetch action log settings:', error);
        return { id: 1, ignored_channels: [], ignored_roles: [] };
    }
}

/**
 * Renders the action log settings form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the GET request.
 */
exports.showSettingsForm = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeActionLogTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Invalid', message: 'This settings link is invalid or has expired.' });
    }

    try {
        const guild = tokenData.guild;
        await guild.channels.fetch();
        await guild.roles.fetch();

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const roles = guild.roles.cache
            .filter(r => !r.managed && r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const currentSettings = await getSettings();

        res.render('actionlogForm', {
            token,
            channels,
            roles,
            settings: currentSettings
        });
    } catch (error) {
        logger.error('Error preparing action log settings page:', error);
        res.status(500).render('error', { title: 'Server Error', message: 'Could not load server data.' });
    }
};

/**
 * Handles the submission of the action log settings form.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @returns An async function to handle the POST request.
 */
exports.handleSettingsSubmission = (client) => async (req, res) => {
    const { token } = req.params;
    const tokenData = client.activeActionLogTokens?.get(token);

    if (!tokenData) {
        return res.status(404).render('error', { title: 'Link Expired', message: 'This settings link has expired. Your changes were not saved.' });
    }
    client.activeActionLogTokens.delete(token);

    try {
        const formData = req.body;
        const getArray = (value) => {
            if (Array.isArray(value)) return value;
            if (value) return [value];
            return [];
        };

        const settings = {
            id: 1,
            // Message Events
            log_message_delete: formData.log_message_delete === 'on',
            log_message_edit: formData.log_message_edit === 'on',
            log_image_delete: formData.log_image_delete === 'on',
            // Member Events
            log_member_join: formData.log_member_join === 'on',
            log_member_leave: formData.log_member_leave === 'on',
            log_member_role_update: formData.log_member_role_update === 'on',
            log_nickname_change: formData.log_nickname_change === 'on',
            // Voice Events
            log_voice_join: formData.log_voice_join === 'on',
            log_voice_leave: formData.log_voice_leave === 'on',
            log_voice_move: formData.log_voice_move === 'on',
            // Moderation Events
            log_member_ban: formData.log_member_ban === 'on',
            log_member_unban: formData.log_member_unban === 'on',
            log_member_timeout: formData.log_member_timeout === 'on',
            // Role & Channel Events
            log_role_create: formData.log_role_create === 'on',
            log_role_delete: formData.log_role_delete === 'on',
            log_role_update: formData.log_role_update === 'on',
            log_channel_create: formData.log_channel_create === 'on',
            log_channel_delete: formData.log_channel_delete === 'on',
            log_channel_update: formData.log_channel_update === 'on',
            // Invite Events
            log_invite_create: formData.log_invite_create === 'on',
            log_invite_delete: formData.log_invite_delete === 'on',
            // Ignored lists
            ignored_channels: JSON.stringify(getArray(formData.ignored_channels)),
            ignored_roles: JSON.stringify(getArray(formData.ignored_roles)),
        };

        const existingSettings = await db.query('SELECT id FROM action_log_settings WHERE id = 1');

        if (existingSettings.length > 0) {
            const updateClauses = Object.keys(settings).filter(key => key !== 'id').map(key => `\`${key}\` = ?`).join(', ');
            const values = Object.keys(settings).filter(key => key !== 'id').map(key => settings[key]);
            values.push(settings.id);
            const sql = `UPDATE action_log_settings SET ${updateClauses} WHERE id = ?`;
            await db.query(sql, values);
        } else {
            const columns = Object.keys(settings);
            const placeholders = columns.map(() => '?').join(', ');
            const values = Object.values(settings);
            const sql = `INSERT INTO action_log_settings (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
            await db.query(sql, values);
        }

        actionLogHelper.invalidateSettingsCache();
        logger.success('Action log settings updated and cache invalidated.');

        res.render('success', { title: 'Settings Saved!', message: 'Your action log settings have been successfully updated.' });
    } catch (error) {
        logger.error('Error saving action log settings:', error);
        res.status(500).render('error', { title: 'Database Error', message: `Failed to save settings. ${error.message}` });
    }
};

